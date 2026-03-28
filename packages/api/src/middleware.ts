import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { recoverMessageAddress } from 'viem';
import { config } from './config';
import {
  createGasAwareX402Middleware,
  calculateGraphQLComplexity,
} from './x402';
import {
  createCreditSession,
  getSession,
  deductCredits,
  extractPayerFromPaymentHeader,
} from './creditSessions';

// ─── Admin auth ──────────────────────────────────────────────────────────────

// TODO: Update monorepo structure so that we can import this from packages/app/src/lib/constants/constants.ts
export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';
const ALLOWED_ADDRESSES =
  process.env.ALLOWED_ADDRESSES?.split(',').map((a) =>
    a.trim().toLowerCase()
  ) || [];
const MESSAGE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function isValidWalletSignature(
  signature: `0x${string}` | undefined,
  timestampSeconds: number | undefined
): Promise<boolean> {
  if (!signature || !timestampSeconds) {
    return false;
  }
  // Check if signature is expired
  const nowMs = Date.now();
  const timestampMs = timestampSeconds * 1000; // Convert timestamp from seconds to milliseconds
  // Reject far-future timestamps and expired ones
  if (timestampMs > nowMs || nowMs - timestampMs > MESSAGE_EXPIRY) {
    return false;
  }

  try {
    // Bind the signature to the timestamp to prevent replay
    const messageToVerify = `${ADMIN_AUTHENTICATE_MSG}:${timestampSeconds}`;
    const recoveredAddress = await recoverMessageAddress({
      message: messageToVerify,
      signature,
    });

    // Check if recovered address is allowed
    const isAllowed = ALLOWED_ADDRESSES.includes(
      recoveredAddress.toLowerCase()
    );
    if (!isAllowed) {
      console.warn(
        `Admin auth failed: address ${recoveredAddress} not in allowlist`
      );
    }

    return isAllowed;
  } catch (error) {
    console.error('Error recovering address for admin auth', error);
    return false;
  }
}

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // In local development, skip admin auth checks
  if (!config.isProd) {
    return next();
  }

  const signature = (req.headers['x-admin-signature'] || '') as `0x${string}`;
  const timestampHeader = req.headers['x-admin-signature-timestamp'];
  const timestampSeconds = Number(
    Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader
  );

  if (!signature || !timestampSeconds || !Number.isFinite(timestampSeconds)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const ok = await isValidWalletSignature(signature, timestampSeconds);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  return next();
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
    request?: Request
  ) => {
    // Allow all requests unless in production
    if (!config.isProd) {
      callback(null, true);
      return;
    }

    // Check for API token in production
    const authHeader = request?.headers?.authorization;
    const apiToken = process.env.API_ACCESS_TOKEN;

    // If API token is provided and matches, allow the request regardless of origin
    if (
      apiToken &&
      authHeader?.startsWith('Bearer ') &&
      authHeader.slice(7) === apiToken
    ) {
      callback(null, true);
      return;
    }

    // Otherwise, only allow specific domains
    if (
      !origin || // Allow same-origin requests
      /^https?:\/\/([a-zA-Z0-9-]+\.)*sapience\.xyz$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*ethereal\.trade$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*etherealtest\.net$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*etherealdev\.net$/.test(origin) ||
      /^https?:\/\/(app|docs)\.vercel\.app$/.test(origin) || // production Vercel
      /^https?:\/\/(app|docs)-[a-z0-9-]+-sapiencexyz\.vercel\.app$/.test(
        origin
      ) || // preview deploys (git branches and hash-based)
      /^https?:\/\/localhost(:\d+)?$/.test(origin) // Allow localhost with optional port
    ) {
      callback(null, true);
    } else {
      // Reject without throwing — omits CORS headers so browsers still block,
      // but avoids Sentry noise from originless requests (bots/crawlers/SSR).
      callback(null, false);
    }
  },
  optionsSuccessStatus: 200,
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'x-admin-signature',
    'x-admin-signature-timestamp',
    'Payment-Signature', // x402 payment header
    'X-Credit-Session', // credit session token
  ],
  exposedHeaders: [
    'PAYMENT-REQUIRED',
    'PAYMENT-RESPONSE',
    'X-PAYMENT-RESPONSE',
    'X-Credit-Session',
    'X-Credit-Session-Status',
    'X-Credits-Remaining',
  ],
};

// ─── Credit session 402 response ─────────────────────────────────────────────

/**
 * Build a structured 402 response body that explains the credit session system.
 * Designed to be understood by both AI agents and programmatic HTTP clients.
 */
function buildCreditSession402Body(
  message: string,
  status?: 'expired' | 'exhausted'
) {
  const bundleAmount = config.X402_CREDIT_BUNDLE_USDC;
  return {
    error: 'Payment Required',
    message,
    creditSession: {
      ...(status && { status }),
      protocol: 'x402',
      scheme: 'exact',
      network: 'eip155:42161',
      payTo: config.X402_PAY_TO,
      asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum One
      bundle: {
        amount: String(bundleAmount),
        currency: 'USDC',
        decimals: 6,
        amountUSD: `$${(bundleAmount / 1e6).toFixed(2)}`,
      },
      sessionTTLSeconds: Math.floor(config.X402_CREDIT_SESSION_TTL_MS / 1000),
      pricing:
        'Each query costs credits equal to its GraphQL complexity score (minimum 1). ' +
        'Simple queries (~50-100) are cheap; complex aggregations (~5000+) cost more.',
      instructions: {
        step1:
          'Send the same request with a Payment-Signature header containing a signed x402 exact-scheme payload for the bundle amount.',
        step2:
          'On success, read the X-Credit-Session response header — this is your session token.',
        step3:
          'On subsequent requests, include the header X-Credit-Session: <token> to spend credits without paying again.',
        step4:
          'Each request deducts credits equal to the query complexity score. When credits run out, you will receive this 402 again.',
      },
    },
  };
}

// ─── Middleware setup ────────────────────────────────────────────────────────

/**
 * Apply all middleware to the Express app.
 * Creates fresh rate limiter instances per call so tests get isolation.
 */
export function setupMiddleware(app: Express) {
  // Base middleware
  // Configure Helmet CSP to allow Apollo Sandbox's embedded explorer
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            'https://embeddable-sandbox.cdn.apollographql.com',
          ],
          'frame-src': ["'self'", 'https://sandbox.embed.apollographql.com'],
          'img-src': [
            "'self'",
            'data:',
            'https://apollo-server-landing-page.cdn.apollographql.com',
          ],
          'connect-src': ["'self'", 'https://*.apollographql.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json());
  app.use(cors(corsOptions));

  // Create FRESH rate limiters for this app instance
  const freeTierLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.FREE_TIER_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting if request has payment header or valid credit session
      // We check for header presence (not validated payment) because
      // freeTierLimiter runs BEFORE x402/credit middleware validates them
      return (
        !!req.headers['payment-signature'] || !!req.headers['x-credit-session']
      );
    },
    // Custom handler to mark for payment instead of rejecting
    handler: (req: Request, _res: Response, next: NextFunction) => {
      // When free tier is exceeded, mark for payment requirement
      (req as Request & { requiresPayment?: boolean }).requiresPayment = true;
      // Pass control to next middleware (x402)
      next();
    },
  });

  // Tiered rate limiting system
  if (config.X402_PAY_TO) {
    // Single rate limiter — excess goes to 402 payment path
    app.use(freeTierLimiter);

    // Credit session check + conditional x402 payment
    const x402Middleware = createGasAwareX402Middleware();

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const creditToken = req.headers['x-credit-session'] as string | undefined;
      const hasPaymentHeader = req.headers['payment-signature'];
      const requiresPayment = (req as Request & { requiresPayment?: boolean })
        .requiresPayment;

      // --- Credit session check ---
      let creditSessionFailed = false;
      let creditFailureReason: 'expired' | 'exhausted' | undefined;
      if (creditToken) {
        const session = await getSession(creditToken);
        if (session) {
          // Cost = query complexity score (minimum 1)
          let cost = 1;
          if (
            req.path === '/graphql' &&
            req.method === 'POST' &&
            req.body?.query
          ) {
            cost = Math.max(
              1,
              calculateGraphQLComplexity(req.body.query, req.body.variables)
            );
          }

          if (await deductCredits(creditToken, cost)) {
            const remaining = (await getSession(creditToken))?.credits ?? 0;
            res.setHeader('X-Credits-Remaining', String(remaining));
            return next();
          }
          creditFailureReason = 'exhausted';
        } else {
          creditFailureReason = 'expired';
        }
        // Invalid/expired/exhausted — must pay again
        creditSessionFailed = true;
      }

      // --- x402 payment path ---
      if (requiresPayment || hasPaymentHeader || creditSessionFailed) {
        // No payment header — send a descriptive 402 explaining the credit
        // system so AI agents and programmatic clients know what to do.
        if (!hasPaymentHeader) {
          if (creditSessionFailed) {
            res.setHeader('X-Credit-Session-Status', creditFailureReason!);
          }
          const message =
            creditFailureReason === 'exhausted'
              ? 'Your credit session has run out of credits. Make a new x402 payment to purchase a fresh credit bundle.'
              : creditFailureReason === 'expired'
                ? 'Your credit session has expired or is invalid. Make a new x402 payment to start a new session.'
                : 'Free tier rate limit exceeded. Make an x402 payment to purchase a credit bundle for continued access.';
          res
            .status(402)
            .json(buildCreditSession402Body(message, creditFailureReason));
          return;
        }

        try {
          await x402Middleware(req, res, async (err?: unknown) => {
            if (err) return next(err);

            // Payment succeeded — create credit session for the payer
            const paymentHeader = req.headers['payment-signature'] as string;
            const wallet = extractPayerFromPaymentHeader(paymentHeader);

            if (wallet) {
              try {
                const { token, credits } = await createCreditSession(
                  wallet,
                  config.X402_CREDIT_BUNDLE_USDC,
                  config.X402_CREDIT_SESSION_TTL_MS
                );
                res.setHeader('X-Credit-Session', token);
                res.setHeader('X-Credits-Remaining', String(credits));
              } catch (e) {
                console.error('[x402] Failed to create credit session:', e);
                // Continue without session — payment still succeeded
              }
            }

            next();
          });
        } catch (err) {
          console.error('[x402] Payment middleware error:', err);
          if (!res.headersSent) {
            res.status(503).json({
              error: 'Service Unavailable',
              message: 'Payment processing failed. Please try again later.',
            });
          }
        }
        return;
      }

      // Under free tier, no credit session, no payment header — continue normally
      next();
    });
  } else {
    // Simple rate limiting - no payment path, just reject with 429
    app.use(
      rateLimit({
        windowMs: config.RATE_LIMIT_WINDOW_MS,
        max: config.FREE_TIER_RATE_LIMIT,
        standardHeaders: true,
        legacyHeaders: false,
      })
    );

    console.log('[x402] Tiered rate limiting disabled (X402_PAY_TO not set)');
  }
}
