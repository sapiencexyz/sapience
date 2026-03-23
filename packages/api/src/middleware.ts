import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { recoverMessageAddress } from 'viem';
import { config } from './config';
import { createGasAwareX402Middleware } from './x402';

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
  ],
  exposedHeaders: [
    'PAYMENT-REQUIRED',
    'PAYMENT-RESPONSE',
    'X-PAYMENT-RESPONSE',
  ],
};

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
      // Skip rate limiting if request has payment header
      // We check for the header presence (not validated payment) because
      // freeTierLimiter runs BEFORE x402 middleware validates the payment
      return !!req.headers['payment-signature'];
    },
    // Custom handler to mark for payment instead of rejecting
    handler: (req: Request, _res: Response, next: NextFunction) => {
      // When free tier is exceeded, mark for payment requirement
      (req as Request & { requiresPayment?: boolean }).requiresPayment = true;
      // Pass control to next middleware (x402)
      next();
    },
  });

  const hardLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.HARD_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    // No skip - count all requests regardless of payment status
    message: {
      error: 'Too Many Requests',
      message: `Hard limit of ${config.HARD_RATE_LIMIT} requests per minute exceeded.`,
      tier: 'hard_limit',
    },
  });

  // Tiered rate limiting system
  if (config.X402_PAY_TO) {
    // Tier 1: Hard limit check first (reject early if >400 req/min)
    app.use(hardLimiter);

    // Tier 2: Free tier check (flag if needs payment)
    app.use(freeTierLimiter);

    // Tier 3: Conditional x402 payment processing (in-process facilitator)
    const x402Middleware = createGasAwareX402Middleware();

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const hasPaymentHeader = req.headers['payment-signature'];

      // Process payment if either:
      // 1. Free tier exceeded (req.requiresPayment=true) OR
      // 2. Request has payment header (even if under free tier)
      if (
        (req as Request & { requiresPayment?: boolean }).requiresPayment ||
        hasPaymentHeader
      ) {
        try {
          // x402 middleware handles both cases:
          // - No payment header → sends 402 directly (callback never called)
          // - Valid payment → calls callback, then settles on-chain
          await x402Middleware(req, res, next);
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
      // Under free tier and no payment header - continue normally
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
