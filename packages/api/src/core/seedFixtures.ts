import { createLogger } from './logger';

const log = createLogger('fixtures');

export interface SeedRetryOptions {
  /** Total attempts before giving up (logged, never thrown). */
  maxAttempts?: number;
  /** Base backoff; the delay before attempt N is baseDelayMs * (N-1). */
  baseDelayMs?: number;
  /**
   * Hard ceiling on how long seeding may delay startup. When exceeded we
   * stop awaiting and return (non-fatal); any in-flight attempt keeps
   * running in the background. Omit to wait for the retry loop to finish.
   */
  overallTimeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a one-time seeding operation with bounded retry. Two terminal modes,
 * by design — they correspond to genuinely different failure causes:
 *
 *   - RESOLVES on success, OR when the overall boot budget elapses while a
 *     seed is still in flight (slow/hung query). Budget-exceeded is logged
 *     at error level (→ Sentry) but NON-FATAL: the caller binds the port
 *     and serves. Crashing on slowness would just re-create the
 *     boot-timeout → permanent-502 incident as a crash-loop.
 *   - THROWS when every retry errors out before the budget elapses
 *     (definitive failure). With the DB already connected (initializeDataSource
 *     runs first), that means seeding genuinely can't proceed — a real bug or
 *     bad deploy — so the caller should crash loudly and let the platform
 *     restart, rather than serve an unseeded API.
 *
 * Boot queries bypass the request-path 8s timeout (the caller wraps `seed`
 * in runWithoutQueryTimeout) so a slow-but-progressing cold-boot query isn't
 * killed; `overallTimeoutMs` is the only ceiling on how long seeding may
 * hold up the port.
 */
export const seedFixturesWithRetry = async (
  seed: () => Promise<void>,
  {
    maxAttempts = 5,
    baseDelayMs = 1_000,
    overallTimeoutMs,
    sleep = defaultSleep,
  }: SeedRetryOptions = {}
): Promise<void> => {
  let timedOut = false;

  const loop = async (): Promise<void> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (timedOut) return;
      try {
        await seed();
        if (attempt > 1) {
          log.info({ attempt }, 'Fixture seeding succeeded after retry');
        }
        return;
      } catch (err) {
        // Budget elapsed mid-flight: stop quietly — the caller has already
        // moved on and binding the port must not be undone by a late throw.
        if (timedOut) return;
        if (attempt >= maxAttempts) {
          log.error(
            { err, attempt },
            'Fixture seeding failed after all retries'
          );
          throw err;
        }
        log.warn({ err, attempt }, 'Fixture seeding attempt failed; retrying');
        await sleep(baseDelayMs * attempt);
      }
    }
  };

  if (overallTimeoutMs == null) {
    await loop();
    return;
  }

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    deadlineTimer = setTimeout(() => {
      timedOut = true;
      resolve('timeout');
    }, overallTimeoutMs);
  });

  try {
    const result = await Promise.race([
      loop().then(() => 'done' as const),
      deadline,
    ]);
    if (result === 'timeout') {
      log.error(
        { overallTimeoutMs },
        'Fixture seeding exceeded boot budget; binding port anyway (any in-flight seed continues in the background)'
      );
    }
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
};
