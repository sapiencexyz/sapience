/**
 * Shared types for keeper Discord notifications.
 *
 * Two flows feed the DISCORD_KEEPER_WEBHOOK:
 *  - per-cron-group run summaries (built by the cron runner in
 *    scripts/lib/groups.js from the StepRun records below)
 *  - a balance heartbeat (scripts/keeper-status.ts) over BalanceReport
 */

export type StepStatus = 'ok' | 'failed' | 'skipped';

/**
 * One subservice's structured result, emitted to the file named by
 * KEEPER_SUMMARY_FILE so the (separate-process) cron runner can read it back.
 */
export interface StepSummary {
  /** Canonical subservice name, e.g. 'relist', 'settle-pyth'. */
  step: string;
  /** Counts/keyed metrics, e.g. { created: 3, skipped: 2, errors: 0 }. */
  metrics?: Record<string, number | string>;
  /** True when the run was a dry run (no writes). */
  dryRun?: boolean;
  /** Optional one-line note. */
  note?: string;
}

/** A step as observed by the cron runner: emitted summary + process outcome. */
export interface StepRun {
  /** Runner's label for the step, e.g. 'settle'. */
  label: string;
  status: StepStatus;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Structured summaries the step emitted (usually 0 or 1). */
  summaries: StepSummary[];
  /** Error message if the step failed. */
  error?: string;
}

export interface OpenRouterBalance {
  /** USD credits remaining = total_credits - total_usage. */
  remaining: number;
  totalCredits: number;
  totalUsage: number;
  /** Best-effort burn-rate context from /api/v1/key. */
  usageDaily?: number;
  usageWeekly?: number;
  usageMonthly?: number;
}

export interface PolBalance {
  address: string;
  /** POL, human-readable. */
  pol: number;
}

export interface BalanceReport {
  openrouter?: OpenRouterBalance;
  openrouterError?: string;
  pol?: PolBalance;
  polError?: string;
}

export interface BalanceThresholds {
  /** Minimum acceptable OpenRouter USD credits. */
  openrouterMinCredits: number;
  /** Minimum acceptable admin POL balance. */
  adminMinPol: number;
}

export interface BalanceClassification {
  openrouterLow: boolean;
  polLow: boolean;
  /** True if any tracked balance is below threshold. */
  anyLow: boolean;
}
