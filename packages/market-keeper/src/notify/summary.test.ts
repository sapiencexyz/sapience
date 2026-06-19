import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  emitStepSummary,
  readStepSummaries,
  parseStepSummaries,
  SUMMARY_FILE_ENV,
} from './summary';

describe('parseStepSummaries', () => {
  it('parses well-formed JSONL', () => {
    const raw =
      '{"step":"relist","metrics":{"created":3}}\n{"step":"generate","metrics":{"created":1}}\n';
    const out = parseStepSummaries(raw);
    expect(out).toHaveLength(2);
    expect(out[0].step).toBe('relist');
    expect(out[0].metrics?.created).toBe(3);
    expect(out[1].step).toBe('generate');
  });

  it('skips blank and malformed lines', () => {
    const raw = '\n{"step":"a"}\nnot-json\n{"missing":"step"}\n  \n';
    const out = parseStepSummaries(raw);
    expect(out).toHaveLength(1);
    expect(out[0].step).toBe('a');
  });

  it('returns [] for empty input', () => {
    expect(parseStepSummaries('')).toEqual([]);
  });
});

describe('emitStepSummary / readStepSummaries round-trip', () => {
  let file: string;
  const original = process.env[SUMMARY_FILE_ENV];

  beforeEach(() => {
    file = path.join(
      os.tmpdir(),
      `keeper-summary-test-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`
    );
    process.env[SUMMARY_FILE_ENV] = file;
  });

  afterEach(() => {
    if (original === undefined) delete process.env[SUMMARY_FILE_ENV];
    else process.env[SUMMARY_FILE_ENV] = original;
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  });

  it('appends emitted summaries and reads them back in order', () => {
    emitStepSummary({ step: 'relist', metrics: { created: 2, skipped: 1 } });
    emitStepSummary({
      step: 'settle-pyth',
      metrics: { settled: 5 },
      dryRun: true,
    });

    const out = readStepSummaries(file);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ step: 'relist', metrics: { created: 2 } });
    expect(out[1]).toMatchObject({ step: 'settle-pyth', dryRun: true });
  });

  it('is a no-op (and does not throw) when the env var is unset', () => {
    delete process.env[SUMMARY_FILE_ENV];
    expect(() =>
      emitStepSummary({ step: 'x', metrics: { n: 1 } })
    ).not.toThrow();
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe('readStepSummaries', () => {
  it('returns [] when the file does not exist', () => {
    expect(readStepSummaries('/no/such/keeper-summary.jsonl')).toEqual([]);
  });
});
