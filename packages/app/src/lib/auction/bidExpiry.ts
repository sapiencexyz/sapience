/**
 * Seconds subtracted from a counterparty bid's on-chain deadline when
 * deciding whether to display it as expired or accept a submit click.
 * Intent: a user who acts at the last visible moment still leaves time for
 * the UserOp bundler / inclusion latency — otherwise the on-chain deadline
 * check returns false and the protocol surfaces it as
 * `InvalidCounterpartySignature`.
 */
export const DEADLINE_DISPLAY_BUFFER_SECS = 1;

/** Effective deadline (in seconds) used for client-side checks. */
export function effectiveDeadlineSecs(deadlineSecs: number): number {
  return deadlineSecs - DEADLINE_DISPLAY_BUFFER_SECS;
}

/** Effective deadline in milliseconds (convenience for `* 1000` comparisons). */
export function effectiveDeadlineMs(deadlineSecs: number): number {
  return effectiveDeadlineSecs(deadlineSecs) * 1000;
}

/** Remaining ms against the effective (buffered) deadline; never negative. */
export function remainingMsToDeadline(
  deadlineSecs: number,
  nowMs: number
): number {
  return Math.max(0, effectiveDeadlineMs(deadlineSecs) - nowMs);
}

/** True when the bid should be treated as expired client-side. */
export function isBidExpired(deadlineSecs: number, nowMs: number): boolean {
  return effectiveDeadlineMs(deadlineSecs) <= nowMs;
}
