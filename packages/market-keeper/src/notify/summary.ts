/**
 * Cross-process result reporting for keeper subservices.
 *
 * Each subservice runs as its own `node dist/scripts/X.js` process, so it can't
 * hand a return value back to the cron runner in memory. Instead it appends a
 * JSON line to the file named by KEEPER_SUMMARY_FILE; the runner
 * (scripts/lib/groups.js) provisions that file, sets the env var, and reads the
 * lines back to build the per-group Discord summary.
 */
import * as fs from 'fs';
import type { StepSummary } from './types';

export const SUMMARY_FILE_ENV = 'KEEPER_SUMMARY_FILE';

/**
 * Append one structured step summary as a JSON line to KEEPER_SUMMARY_FILE.
 *
 * No-op when the env var is unset (e.g. running a subservice directly, outside
 * the cron runner). MUST NEVER THROW — these calls sit at the end of production
 * settlement/generation paths and a reporting failure must not break the work.
 */
export function emitStepSummary(summary: StepSummary): void {
  try {
    const file = process.env[SUMMARY_FILE_ENV];
    if (!file) return;
    fs.appendFileSync(file, `${JSON.stringify(summary)}\n`);
  } catch {
    // best-effort: never let reporting break the subservice
  }
}

/** Read a JSONL summary file into StepSummary[]; tolerant of malformed lines. */
export function readStepSummaries(file: string): StepSummary[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return parseStepSummaries(raw);
}

/** Parse JSONL content into StepSummary[], skipping blank/malformed lines. */
export function parseStepSummaries(raw: string): StepSummary[] {
  const out: StepSummary[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (
        obj &&
        typeof obj === 'object' &&
        typeof (obj as StepSummary).step === 'string'
      ) {
        out.push(obj as StepSummary);
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}
