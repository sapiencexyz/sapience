import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { recoverMessageAddress } from 'viem';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { config } from '../core/config';
import { logger, createLogger } from '../core/logger';

const log = createLogger('middleware');

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
      log.warn(
        { recoveredAddress },
        'Admin auth failed: address not in allowlist'
      );
    }

    return isAllowed;
  } catch (err) {
    log.error({ err }, 'Error recovering address for admin auth');
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

const PRIVATE_LAN_DEV_PORTS = new Set(['5173']);

type CorsOriginOptions = {
  allowPrivateLanDevOrigins?: boolean;
  allowStagingPreviewOrigins?: boolean;
};

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  options: CorsOriginOptions = {}
): boolean {
  if (!origin) {
    return true;
  }

  if (
    /^https?:\/\/([a-zA-Z0-9-]+\.)*sapience\.xyz$/.test(origin) ||
    /^https?:\/\/([a-zA-Z0-9-]+\.)*ethereal\.trade$/.test(origin) ||
    /^https?:\/\/([a-zA-Z0-9-]+\.)*etherealtest\.net$/.test(origin) ||
    /^https?:\/\/([a-zA-Z0-9-]+\.)*etherealdev\.net$/.test(origin) ||
    /^https?:\/\/(app|docs)\.vercel\.app$/.test(origin) ||
    /^https?:\/\/(app|docs)-[a-z0-9-]+-sapiencexyz\.vercel\.app$/.test(
      origin
    ) ||
    /^https?:\/\/([a-zA-Z0-9-]+-)?meridianxyz\.vercel\.app$/.test(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  ) {
    return true;
  }

  // Staging-only preview origins (e.g. external collaborators' Vercel previews).
  if (
    options.allowStagingPreviewOrigins === true &&
    /^https?:\/\/combo-bingo\.vercel\.app$/.test(origin)
  ) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      options.allowPrivateLanDevOrigins === true &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      PRIVATE_LAN_DEV_PORTS.has(url.port) &&
      isPrivateIpv4(url.hostname)
    );
  } catch {
    return false;
  }
}

function isStagingRequest(request: Request): boolean {
  const host = request.hostname.toLowerCase();
  return config.NODE_ENV === 'staging' || host === 'api.staging.sapience.xyz';
}

function createCorsOptions(request: Request): cors.CorsOptions {
  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      // Allow all requests unless in production
      if (!config.isProd) {
        callback(null, true);
        return;
      }

      // Check for API token in production
      const authHeader = request.headers.authorization;
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

      if (
        isAllowedCorsOrigin(origin, {
          allowPrivateLanDevOrigins: isStagingRequest(request),
          allowStagingPreviewOrigins: isStagingRequest(request),
        })
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
      'X-Request-ID',
    ],
  };
}

// ─── Middleware setup ────────────────────────────────────────────────────────

/**
 * Apply all middleware to the Express app.
 * Creates fresh rate limiter instances per call so tests get isolation.
 */
export function setupMiddleware(app: Express) {
  // Request logging — must run first so every other middleware (and the
  // global error handler) can use `req.log` and inherit the request id.
  // /graphql is skipped because the Apollo operationTimingPlugin emits its
  // own structured log per request; /health and /ready are skipped to keep
  // load-balancer probes out of the log stream.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const upstream = req.headers['x-request-id'];
        const id =
          typeof upstream === 'string' && upstream ? upstream : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return (
            url === '/health' || url === '/ready' || url.startsWith('/graphql')
          );
        },
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        return 'info';
      },
    })
  );

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
  app.use((req, res, next) => cors(createCorsOptions(req))(req, res, next));

  // Rate limiting runs before body parsing so rejected requests are cheap.
  // Custom handler emits a structured `gql_shed` log line and returns a
  // GraphQL-shaped error body with `extensions.code='IP_RATE_LIMIT'` so
  // clients (and the load-test harness) can distinguish this layer from
  // the per-IP and global concurrency layers — see concurrencyLimiter.ts.
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        const reqIdRaw = (req as Request & { id?: string | number }).id;
        const requestId =
          typeof reqIdRaw === 'string' || typeof reqIdRaw === 'number'
            ? String(reqIdRaw)
            : ((req.headers['x-request-id'] as string) ?? undefined);
        // Body isn't parsed yet — fall back to the client-supplied
        // `x-operation-name` header. Trustworthy for our own benchmarks
        // (we control the client); for adversarial traffic the
        // server-derived occupant snapshot in the concurrency layers
        // is the source of truth.
        const operationName =
          (req.headers['x-operation-name'] as string | undefined) ||
          (req.headers['apollographql-client-name'] as string | undefined);
        log.warn(
          {
            event: 'gql_shed',
            layer: 'ip_rate_limit',
            extensionsCode: 'IP_RATE_LIMIT',
            ip: req.ip,
            path: req.path,
            requestId,
            operationName,
            windowMs: config.RATE_LIMIT_WINDOW_MS,
            maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
          },
          'gql_shed ip_rate_limit'
        );
        res.status(429).json({
          errors: [
            {
              message: 'Too many requests. Please retry shortly.',
              extensions: { code: 'IP_RATE_LIMIT' },
            },
          ],
        });
      },
    })
  );

  // Body parsing after rate limiting — routes can override with stricter limits
  app.use(express.json({ limit: '100kb' }));
}
