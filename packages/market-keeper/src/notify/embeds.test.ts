import { describe, it, expect } from 'vitest';
import { buildGroupEmbed, buildHeartbeatEmbed, formatDuration } from './embeds';
import type { StepRun, BalanceReport, BalanceClassification } from './types';

describe('formatDuration', () => {
  it('formats sub-second, seconds, and minutes', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(2500)).toBe('2.5s');
    expect(formatDuration(125000)).toBe('2m5s');
  });
});

describe('buildGroupEmbed', () => {
  it('builds a green success embed with per-step metrics', () => {
    const runs: StepRun[] = [
      {
        label: 'generate',
        status: 'ok',
        durationMs: 3200,
        summaries: [{ step: 'generate', metrics: { created: 4, skipped: 1 } }],
      },
      {
        label: 'relist',
        status: 'ok',
        durationMs: 1500,
        summaries: [{ step: 'relist', metrics: { new: 2 } }],
      },
    ];
    const embed = buildGroupEmbed('discovery', runs, 'production') as Record<
      string,
      unknown
    >;
    expect(embed.title).toBe('✅ Keeper · discovery');
    expect(embed.color).toBe(0x22c55e);
    expect((embed.footer as { text: string }).text).toBe('env: production');
    const desc = embed.description as string;
    expect(desc).toContain('✅ **generate**');
    expect(desc).toContain('created=4');
    expect(desc).toContain('skipped=1');
    expect(desc).toContain('✅ **relist**');
    expect(desc).toContain('new=2');
  });

  it('builds a red embed on failure and marks later steps skipped', () => {
    const runs: StepRun[] = [
      {
        label: 'cleanup-polymarket',
        status: 'ok',
        durationMs: 1000,
        summaries: [],
      },
      {
        label: 'settle',
        status: 'failed',
        durationMs: 800,
        summaries: [],
        error: 'POLYGON_RPC_URL timeout',
      },
      { label: 'settle-pyth', status: 'skipped', durationMs: 0, summaries: [] },
    ];
    const embed = buildGroupEmbed('settlement', runs, 'staging') as Record<
      string,
      unknown
    >;
    expect(embed.title).toBe('❌ Keeper · settlement');
    expect((embed.footer as { text: string }).text).toBe('env: staging');
    expect(embed.color).toBe(0xef4444);
    const desc = embed.description as string;
    expect(desc).toContain('❌ **settle**');
    expect(desc).toContain('POLYGON_RPC_URL timeout');
    expect(desc).toContain('⏭️ **settle-pyth**');
  });

  it('tags dry-run steps', () => {
    const runs: StepRun[] = [
      {
        label: 'relist',
        status: 'ok',
        durationMs: 500,
        summaries: [{ step: 'relist', metrics: { new: 0 }, dryRun: true }],
      },
    ];
    const desc = (
      buildGroupEmbed('discovery', runs, 'production') as {
        description: string;
      }
    ).description;
    expect(desc).toContain('_[dry-run]_');
  });
});

describe('buildHeartbeatEmbed', () => {
  const ok: BalanceClassification = {
    openrouterLow: false,
    polLow: false,
    anyLow: false,
  };

  it('renders a blue heartbeat with balances when all ok', () => {
    const report: BalanceReport = {
      openrouter: {
        remaining: 50,
        totalCredits: 100,
        totalUsage: 50,
        usageDaily: 7.11,
      },
      pol: { address: '0xADMIN', pol: 12.345 },
    };
    const embed = buildHeartbeatEmbed(report, ok, 'production') as Record<
      string,
      unknown
    >;
    expect(embed.title).toBe('💓 Keeper heartbeat');
    expect(embed.color).toBe(0x3b82f6);
    expect((embed.footer as { text: string }).text).toBe('env: production');
    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields[0].value).toContain('$50.00 remaining');
    expect(fields[0].value).toContain('~$7.11/day');
    expect(fields[1].value).toContain('12.345 POL');
    expect(fields[1].value).toContain('0xADMIN');
  });

  it('renders an amber LOW alert with warning markers', () => {
    const report: BalanceReport = {
      openrouter: { remaining: 1.62, totalCredits: 360, totalUsage: 358.38 },
      pol: { address: '0xADMIN', pol: 0.5 },
    };
    const cls: BalanceClassification = {
      openrouterLow: true,
      polLow: true,
      anyLow: true,
    };
    const embed = buildHeartbeatEmbed(report, cls, 'production') as Record<
      string,
      unknown
    >;
    expect(embed.title).toBe('⚠️ Keeper balances LOW');
    expect(embed.color).toBe(0xf59e0b);
    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields[0].name).toContain('⚠️');
    expect(fields[1].name).toContain('⚠️');
  });

  it('surfaces fetch errors as a red embed', () => {
    const report: BalanceReport = {
      openrouterError: 'HTTP 401',
      polError: 'rpc down',
    };
    const embed = buildHeartbeatEmbed(report, ok, 'production') as Record<
      string,
      unknown
    >;
    expect(embed.color).toBe(0xef4444);
    const fields = embed.fields as Array<{ value: string }>;
    expect(fields[0].value).toContain('HTTP 401');
    expect(fields[1].value).toContain('rpc down');
  });
});
