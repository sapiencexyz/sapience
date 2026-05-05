import pino, {
  type Logger,
  type LoggerOptions,
  type DestinationStream,
} from 'pino';
import Sentry from './instrument';
import { config } from './config';

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

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-admin-signature"]',
  'res.headers["set-cookie"]',
];

const baseOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
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
 */
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

      const { err: _omit, ...rest } = obj;
      Sentry.captureException(error, {
        level: level >= 60 ? 'fatal' : 'error',
        extra: rest,
      });
    } catch {
      // Never let logging crash the app.
    }
  },
};

const buildLogger = (): Logger => {
  if (config.isDev) {
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
