import { config as dotEnvConfig } from 'dotenv';
import pino, {
  type Logger,
  type LoggerOptions,
  type DestinationStream,
} from 'pino';
import { fromRoot } from '../lib/fromRoot';
import Sentry from './instrument';

// Load .env before reading process.env. core/config also loads dotenv, but
// only lazily on first access — and this module's NODE_ENV check runs
// eagerly at import time (before any code touches config), which would
// otherwise see undefined and fall back to JSON output in dev.
// We load dotenv directly (not via core/config) to skip envalid validation,
// which would require DATABASE_URL and break build scripts / isolated tests.
dotEnvConfig({ path: fromRoot('.env') });

/**
 * House logging conventions (object-first):
 *   logger.info({ blockNumber, txHash }, 'Indexed block')
 *   logger.error({ err }, 'Failed to fetch')   // err in object → std serializer preserves stack
 *
 * Never `logger.error('msg', err)` — message-positional args lose the stack
 * because Pino doesn't run its error serializer on string-positional args.
 *
 * Levels (numeric → label):
 *   10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal
 *
 * In production, level >= 50 is forwarded to Sentry via the multistream
 * destination below. In development, Sentry is disabled (see instrument.ts)
 * and logs are pretty-printed.
 */

const PINO_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
] as const;
type PinoLevel = (typeof PINO_LEVELS)[number];

const isPinoLevel = (v: unknown): v is PinoLevel =>
  typeof v === 'string' && (PINO_LEVELS as readonly string[]).includes(v);

const resolveLogLevel = (): PinoLevel => {
  const raw = process.env.LOG_LEVEL;
  if (isPinoLevel(raw)) return raw;
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === 'development' || nodeEnv === 'test' ? 'debug' : 'info';
};

// Mirrors envalid's `isDev` semantics: only NODE_ENV === 'development'.
// Pretty-printing is dev-only; Sentry is disabled in dev (see instrument.ts).
const resolveIsDev = (): boolean => process.env.NODE_ENV === 'development';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-admin-signature"]',
  'res.headers["set-cookie"]',
];

const baseOptions: LoggerOptions = {
  level: resolveLogLevel(),
  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]',
  },
};

/**
 * Pino destination that forwards error/fatal log lines to Sentry.
 *
 * Reconstructs an Error from the serialized `err` object so Sentry's
 * existing `beforeSend` filter (which inspects err.statusCode / err.status
 * to drop expected 4xx) keeps working.
 *
 * Recognized merging-object fields:
 *   err          → Error (message/stack/name/statusCode preserved)
 *   tags         → forwarded as Sentry tags (string-keyed)
 *   sentryLevel  → 'warning' | 'error' | 'fatal' (overrides level-derived default)
 * Everything else lands in Sentry's `extra`.
 *
 * Non-exception messages: use `Sentry.captureMessage(...)` directly. The 3
 * existing call sites are intentional — message-events are semantically
 * distinct from exceptions and shouldn't go through this funnel.
 */
type SentryLevel = 'warning' | 'error' | 'fatal';
const isSentryLevel = (v: unknown): v is SentryLevel =>
  v === 'warning' || v === 'error' || v === 'fatal';

const sentryStream: DestinationStream = {
  write(line: string) {
    try {
      const obj = JSON.parse(line);
      const level = typeof obj.level === 'number' ? obj.level : 0;
      if (level < 50) return;

      const errPayload = obj.err as
        | {
            type?: string;
            message?: string;
            stack?: string;
            statusCode?: number;
            status?: number;
          }
        | undefined;

      const error =
        errPayload && typeof errPayload === 'object'
          ? Object.assign(
              new Error(errPayload.message ?? obj.msg ?? 'logged error'),
              {
                name: errPayload.type ?? 'Error',
                stack: errPayload.stack,
                ...(errPayload.statusCode !== undefined && {
                  statusCode: errPayload.statusCode,
                }),
                ...(errPayload.status !== undefined && {
                  status: errPayload.status,
                }),
              }
            )
          : new Error(typeof obj.msg === 'string' ? obj.msg : 'logged error');

      const sentryLevel: SentryLevel = isSentryLevel(obj.sentryLevel)
        ? obj.sentryLevel
        : level >= 60
          ? 'fatal'
          : 'error';

      const tags =
        obj.tags && typeof obj.tags === 'object' && !Array.isArray(obj.tags)
          ? (obj.tags as Record<string, string | number | boolean | null>)
          : undefined;

      const {
        err: _omitErr,
        tags: _omitTags,
        sentryLevel: _omitLevel,
        ...rest
      } = obj;

      Sentry.captureException(error, {
        level: sentryLevel,
        ...(tags && { tags }),
        extra: rest,
      });
    } catch {
      // Never let logging crash the app.
    }
  },
};

const buildLogger = (): Logger => {
  if (resolveIsDev()) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l' },
      },
    });
  }

  return pino(
    baseOptions,
    pino.multistream([
      { stream: process.stdout },
      { level: 'error', stream: sentryStream },
    ])
  );
};

export const logger: Logger = buildLogger();

/**
 * Create a child logger bound to a module name. Use one per file at the top:
 *
 *   const log = createLogger('easIndexer');
 *   log.info({ blockNumber }, 'Indexed block');
 */
export const createLogger = (module: string): Logger =>
  logger.child({ module });

/**
 * Wrap an async operation with timing + structured success/error logs.
 * Used by GraphQL resolver-level instrumentation (follow-up PR).
 *
 *   return withTiming(log, 'fetchQuestionsSorted', () => doWork());
 */
export const withTiming = async <T>(
  log: Logger,
  op: string,
  fn: () => Promise<T> | T
): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    log.info(
      { op, durationMs: Math.round(performance.now() - start) },
      `${op}.done`
    );
    return result;
  } catch (err) {
    log.error(
      { err, op, durationMs: Math.round(performance.now() - start) },
      `${op}.failed`
    );
    throw err;
  }
};
