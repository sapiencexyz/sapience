/**
 * Pure Discord embed builders for keeper notifications. No I/O here so these
 * stay trivially unit-testable; the network send lives in ./discord.
 */
import type {
  StepRun,
  StepSummary,
  BalanceReport,
  BalanceClassification,
} from './types';

const COLOR_OK = 0x22c55e; // green
const COLOR_FAIL = 0xef4444; // red
const COLOR_INFO = 0x3b82f6; // blue
const COLOR_WARN = 0xf59e0b; // amber

const STATUS_ICON: Record<string, string> = {
  ok: '✅',
  failed: '❌',
  skipped: '⏭️',
};

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem}s`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Render a step's emitted metrics as `key=value` pieces joined with spaces. */
function formatMetrics(summaries: StepSummary[]): string {
  const parts: string[] = [];
  for (const s of summaries) {
    if (!s.metrics) continue;
    for (const [k, v] of Object.entries(s.metrics)) {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(' ');
}

/** Build a single embed summarizing one cron group's run. */
export function buildGroupEmbed(group: string, runs: StepRun[]): object {
  const failed = runs.some((r) => r.status === 'failed');

  const lines = runs.map((r) => {
    const icon = STATUS_ICON[r.status] ?? '•';
    const dur =
      r.status === 'skipped' ? '' : ` (${formatDuration(r.durationMs)})`;
    const dry = r.summaries.some((s) => s.dryRun) ? ' _[dry-run]_' : '';
    const metrics = formatMetrics(r.summaries);
    const metricsPart = metrics ? ` — ${metrics}` : '';
    const errPart = r.error ? ` — ${truncate(r.error, 140)}` : '';
    return `${icon} **${r.label}**${dur}${dry}${metricsPart}${errPart}`;
  });

  return {
    title: `${failed ? '❌' : '✅'} Keeper · ${group}`,
    color: failed ? COLOR_FAIL : COLOR_OK,
    description: lines.join('\n') || '_no steps_',
    timestamp: new Date().toISOString(),
  };
}

/** Build the balance heartbeat embed (also serves as the low-balance alert). */
export function buildHeartbeatEmbed(
  report: BalanceReport,
  cls: BalanceClassification
): object {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (report.openrouter) {
    const o = report.openrouter;
    const burn =
      o.usageDaily != null ? ` • ~$${o.usageDaily.toFixed(2)}/day` : '';
    fields.push({
      name: `${cls.openrouterLow ? '⚠️ ' : ''}OpenRouter credits`,
      value: `$${o.remaining.toFixed(2)} remaining${burn}`,
      inline: true,
    });
  } else if (report.openrouterError) {
    fields.push({
      name: '⚠️ OpenRouter credits',
      value: `error: ${truncate(report.openrouterError, 120)}`,
      inline: true,
    });
  }

  if (report.pol) {
    fields.push({
      name: `${cls.polLow ? '⚠️ ' : ''}Admin POL`,
      value: `${report.pol.pol.toFixed(3)} POL\n\`${report.pol.address}\``,
      inline: true,
    });
  } else if (report.polError) {
    fields.push({
      name: '⚠️ Admin POL',
      value: `error: ${truncate(report.polError, 120)}`,
      inline: true,
    });
  }

  const anyError = Boolean(report.openrouterError || report.polError);

  return {
    title: cls.anyLow ? '⚠️ Keeper balances LOW' : '💓 Keeper heartbeat',
    color: cls.anyLow ? COLOR_WARN : anyError ? COLOR_FAIL : COLOR_INFO,
    fields,
    timestamp: new Date().toISOString(),
  };
}
