import { describe, it, expect, vi, afterEach } from 'vitest';

// Sentry's namespace export has non-configurable properties so vi.spyOn
// can't replace its methods directly — mock the instrument module instead.
const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock('./instrument', () => ({
  default: { captureException: mockCaptureException },
  initSentry: () => undefined,
}));

import { createLogger, withTiming } from './logger';

const captureStdout = () => {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    const text =
      typeof chunk === 'string'
        ? chunk
        : chunk instanceof Uint8Array
          ? Buffer.from(chunk).toString('utf8')
          : '';
    if (text) writes.push(text);
    return true;
  }) as never);
  return writes;
};

const findLine = (writes: string[], match: string): Record<string, unknown> => {
  const line = writes.find((s) => s.includes(match));
  if (!line) {
    throw new Error(
      `No write contained ${match}. Captured: ${JSON.stringify(writes)}`
    );
  }
  return JSON.parse(line.trim()) as Record<string, unknown>;
};

afterEach(() => {
  vi.restoreAllMocks();
  mockCaptureException.mockClear();
});

describe('createLogger', () => {
  it('attaches a module field to every log line', () => {
    const writes = captureStdout();
    const log = createLogger('unit-test-module');
    log.info({ foo: 1 }, 'hello');
    const parsed = findLine(writes, '"module":"unit-test-module"');
    expect(parsed.module).toBe('unit-test-module');
    expect(parsed.foo).toBe(1);
    expect(parsed.msg).toBe('hello');
  });
});

describe('withTiming', () => {
  it('returns the resolved value and logs op + durationMs at info', async () => {
    const writes = captureStdout();
    const log = createLogger('withTiming-resolve');
    const result = await withTiming(log, 'doWork', () => Promise.resolve(42));
    expect(result).toBe(42);
    const parsed = findLine(writes, '"msg":"doWork.done"');
    expect(parsed.level).toBe(30);
    expect(parsed.op).toBe('doWork');
    expect(parsed.durationMs).toBeTypeOf('number');
  });

  it('re-throws and logs at error level when the inner fn rejects', async () => {
    const writes = captureStdout();
    const log = createLogger('withTiming-reject');
    await expect(
      withTiming(log, 'doWork', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');
    const parsed = findLine(writes, '"msg":"doWork.failed"');
    expect(parsed.level).toBe(50);
    expect(parsed.op).toBe('doWork');
    expect((parsed.err as { message?: string }).message).toBe('boom');
  });
});

describe('Sentry forwarding', () => {
  it('forwards error-level logs to Sentry.captureException', () => {
    captureStdout();
    const log = createLogger('sentry-fwd');
    log.error({ err: new Error('boom'), ctx: 'x' }, 'something failed');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errArg, optsArg] = mockCaptureException.mock.calls[0];
    expect((errArg as Error).message).toBe('boom');
    expect((optsArg as { level?: string }).level).toBe('error');
  });

  it('does not forward warn-level logs to Sentry', () => {
    captureStdout();
    const log = createLogger('sentry-warn');
    log.warn({ slow: true }, 'slow query');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('forwards `tags` from merging object as Sentry tags', () => {
    captureStdout();
    const log = createLogger('sentry-tags');
    log.error(
      { err: new Error('boom'), tags: { conditionId: '0xabc', chainId: 1 } },
      'tagged failure'
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, optsArg] = mockCaptureException.mock.calls[0];
    expect((optsArg as { tags?: Record<string, unknown> }).tags).toEqual({
      conditionId: '0xabc',
      chainId: 1,
    });
  });

  it('honors sentryLevel override (warning) for soft exceptions', () => {
    captureStdout();
    const log = createLogger('sentry-soft');
    log.error(
      { err: new Error('soft'), sentryLevel: 'warning' },
      'soft failure'
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, optsArg] = mockCaptureException.mock.calls[0];
    expect((optsArg as { level?: string }).level).toBe('warning');
  });

  it('defaults to fatal for log.fatal()', () => {
    captureStdout();
    const log = createLogger('sentry-fatal');
    log.fatal({ err: new Error('crash') }, 'fatal');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, optsArg] = mockCaptureException.mock.calls[0];
    expect((optsArg as { level?: string }).level).toBe('fatal');
  });
});
