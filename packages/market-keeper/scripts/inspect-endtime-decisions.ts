#!/usr/bin/env node
/// <reference types="node" />
/**
 * Inspect endtime_decided events emitted by the create + backfill paths.
 *
 * Reads JSON lines from stdin or a file path, filters for
 * `event: 'endtime_decided'` records, sorts by |drift_seconds|, and prints
 * a Markdown table of the outliers.
 *
 * Get logs out of Railway:
 *   railway logs --json --service market-keeper | tsx scripts/inspect-endtime-decisions.ts
 *   tsx scripts/inspect-endtime-decisions.ts ./logs.jsonl
 *
 * Flags:
 *   --threshold N         Only show decisions where |drift_seconds| > N (default 3600 = 1h)
 *   --source <name>       Only show decisions with this source (e.g. llm-high)
 *   --linkbase <url>      Render condition hashes as Markdown links rooted at this URL
 *   --top N               Show only the top N rows by drift magnitude (default 50)
 *   --help, -h            Show this help
 */

import * as fs from 'fs';
import * as readline from 'readline';

interface DecisionLog {
  event: 'endtime_decided';
  conditionHash: string;
  question: string;
  source: string;
  llmTs: number | null;
  pmTs: number | null;
  regexTs: number | null;
  llmConfidence: string | null;
  isTemplated: boolean;
  driftSeconds: number | null;
  finalTs: number;
}

interface CLIOptions {
  threshold: number;
  source: string | null;
  linkbase: string | null;
  top: number;
  filePath: string | null;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const idxOf = (name: string) => args.findIndex((a) => a === name);
  const valueAfter = (name: string): string | null => {
    const i = idxOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const positional = args.find((a, i) => {
    if (a.startsWith('--')) return false;
    // Skip values consumed by named flags (--threshold N, etc.)
    const prev = args[i - 1];
    return !['--threshold', '--source', '--linkbase', '--top'].includes(prev);
  });
  return {
    threshold: Number(valueAfter('--threshold') ?? '3600'),
    source: valueAfter('--source'),
    linkbase: valueAfter('--linkbase'),
    top: Number(valueAfter('--top') ?? '50'),
    filePath: positional ?? null,
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/inspect-endtime-decisions.ts [file] [options]

Reads JSON lines from <file> or stdin, filters for endtime_decided events,
and prints the outliers sorted by |drift_seconds|.

Options:
  --threshold N       Show decisions where |drift_seconds| > N (default 3600)
  --source NAME       Only this source (llm-high|llm-low|llm-unknown|pm-fallback|regex-templated)
  --linkbase URL      Make hashes clickable links rooted at this URL
  --top N             Show only the top N rows (default 50)
  --help, -h          Show this help

Examples:
  railway logs --json --service market-keeper | tsx scripts/inspect-endtime-decisions.ts
  tsx scripts/inspect-endtime-decisions.ts ./keeper-logs.jsonl --threshold 7200
`);
}

/**
 * Extract candidate JSON objects from a log line. Railway wraps every log
 * line in its own JSON envelope ({"message": "<the actual log>", ...});
 * the message itself may be a JSON object string. Try parsing both.
 */
function extractDecisionsFromLine(line: string): DecisionLog[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const out: DecisionLog[] = [];

  const tryPushIfDecision = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    const r = obj as Record<string, unknown>;
    if (r.event !== 'endtime_decided') return;
    if (typeof r.conditionHash !== 'string') return;
    if (typeof r.finalTs !== 'number') return;
    out.push(r as unknown as DecisionLog);
  };

  // Direct parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return out;
  }
  tryPushIfDecision(parsed);

  // Railway-style envelope: parsed = { message: "<json string>" }
  if (parsed && typeof parsed === 'object') {
    const msg = (parsed as Record<string, unknown>).message;
    if (typeof msg === 'string') {
      try {
        const inner = JSON.parse(msg);
        tryPushIfDecision(inner);
      } catch {
        // not nested JSON, ignore
      }
    }
  }

  return out;
}

async function readLines(filePath: string | null): Promise<string[]> {
  const stream = filePath
    ? fs.createReadStream(filePath, { encoding: 'utf8' })
    : process.stdin;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return lines;
}

function formatRow(
  d: DecisionLog,
  linkbase: string | null
): {
  hash: string;
  question: string;
  source: string;
  llm: string;
  pm: string;
  drift: string;
} {
  const shortHash = d.conditionHash.slice(0, 10) + '…';
  const hashCell = linkbase
    ? `[${shortHash}](${linkbase.replace(/\/+$/, '')}/${d.conditionHash})`
    : shortHash;
  const llmIso = d.llmTs ? new Date(d.llmTs * 1000).toISOString() : '—';
  const pmIso = d.pmTs ? new Date(d.pmTs * 1000).toISOString() : '—';
  const driftHours =
    d.driftSeconds === null
      ? '—'
      : `${(d.driftSeconds / 3600).toFixed(2)}h`;
  return {
    hash: hashCell,
    question: d.question.slice(0, 60),
    source: d.source,
    llm: llmIso,
    pm: pmIso,
    drift: driftHours,
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  if (options.help) {
    showHelp();
    return;
  }

  const lines = await readLines(options.filePath);
  const all: DecisionLog[] = [];
  for (const line of lines) {
    all.push(...extractDecisionsFromLine(line));
  }

  if (all.length === 0) {
    console.error(
      `[inspect] No endtime_decided events found in ${options.filePath ?? 'stdin'}.`
    );
    process.exit(2);
  }

  let filtered = all;
  if (options.source) {
    filtered = filtered.filter((d) => d.source === options.source);
  }
  filtered = filtered.filter((d) => {
    if (d.driftSeconds === null) return false;
    return Math.abs(d.driftSeconds) > options.threshold;
  });

  filtered.sort(
    (a, b) =>
      Math.abs(b.driftSeconds ?? 0) - Math.abs(a.driftSeconds ?? 0)
  );

  console.log(
    `# endtime decisions  (${all.length} total, ${filtered.length} outliers above ${options.threshold}s threshold)`
  );
  console.log('');

  // Source distribution summary
  const counts: Record<string, number> = {};
  for (const d of all) counts[d.source] = (counts[d.source] ?? 0) + 1;
  console.log('## Source distribution');
  console.log('');
  for (const [src, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const pct = ((n / all.length) * 100).toFixed(1);
    console.log(`- \`${src}\`: ${n} (${pct}%)`);
  }
  console.log('');

  if (filtered.length === 0) {
    console.log(
      `_No decisions exceeded the |drift| > ${options.threshold}s threshold._`
    );
    return;
  }

  const shown = filtered.slice(0, options.top);
  console.log(
    `## Top ${shown.length} drifts (|drift| > ${options.threshold}s)`
  );
  console.log('');
  console.log(
    '| hash | question | source | llmTs | pmTs | drift |'
  );
  console.log(
    '|------|----------|--------|-------|------|-------|'
  );
  for (const d of shown) {
    const r = formatRow(d, options.linkbase);
    console.log(
      `| ${r.hash} | ${r.question.replace(/\|/g, '\\|')} | ${r.source} | ${r.llm} | ${r.pm} | ${r.drift} |`
    );
  }
  if (filtered.length > shown.length) {
    console.log('');
    console.log(`_…and ${filtered.length - shown.length} more above threshold._`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
