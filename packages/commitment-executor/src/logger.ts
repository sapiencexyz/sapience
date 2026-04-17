/**
 * Minimal structured logger. Matches the console-based style used in the
 * relayer — deliberately does NOT pull in pino so we stay aligned with
 * other sapience workspaces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug: (msg: string, extra?: Record<string, unknown>) => void;
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

function formatExtra(extra?: Record<string, unknown>): string {
  if (!extra) return '';
  try {
    const serializable: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extra)) {
      serializable[k] = typeof v === 'bigint' ? v.toString() : v;
    }
    return ' ' + JSON.stringify(serializable);
  } catch {
    return '';
  }
}

export function createLogger(
  minLevel: LogLevel,
  bindings: Record<string, unknown> = {}
): Logger {
  const threshold = LEVEL_WEIGHT[minLevel];
  const prefix = Object.keys(bindings).length
    ? ' ' + JSON.stringify(bindings)
    : '';

  const emit = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const ts = new Date().toISOString();
    const line = `[${ts}] ${level.toUpperCase()} ${msg}${prefix}${formatExtra(extra)}`;
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (msg, extra) => emit('debug', msg, extra),
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
    child: (childBindings) =>
      createLogger(minLevel, { ...bindings, ...childBindings }),
  };
}
