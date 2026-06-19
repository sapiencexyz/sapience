/**
 * Single entry point the (plain-JS) cron runner requires from dist:
 *   const { readStepSummaries, postGroupReport } =
 *     require('../../dist/src/notify/report');
 *
 * Keeping the runner's dependency on compiled code to this one module means the
 * orchestration layer (scripts/lib/groups.js) stays a thin source-JS file while
 * all the testable logic lives in TypeScript under src/notify.
 */
import { readStepSummaries } from './summary';
import { buildGroupEmbed } from './embeds';
import { postKeeperEmbeds } from './discord';
import type { StepRun } from './types';

export { readStepSummaries };

/**
 * Build and post one cron group's run summary.
 *
 * Set KEEPER_SUMMARY_ON_FAILURE_ONLY=1 to suppress success summaries (cuts
 * noise on frequent crons); failures are always reported.
 */
export async function postGroupReport(input: {
  group: string;
  runs: StepRun[];
}): Promise<void> {
  const failed = input.runs.some((r) => r.status === 'failed');
  if (!failed && process.env.KEEPER_SUMMARY_ON_FAILURE_ONLY === '1') return;
  const embed = buildGroupEmbed(input.group, input.runs);
  await postKeeperEmbeds([embed]);
}
