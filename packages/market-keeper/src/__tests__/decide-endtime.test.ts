import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decideEndTime, toUnixTimestamp } from '../generate/api';
import type { SapienceCondition } from '../types';

function makeCondition(
  overrides: Partial<SapienceCondition> = {}
): SapienceCondition {
  return {
    conditionHash: '0x' + 'a'.repeat(64),
    question: 'q',
    shortName: 'q?',
    categorySlug: 'crypto',
    endDate: '2026-06-01T16:00:00Z',
    description: '',
    similarMarkets: [],
    tags: [],
    chainId: 5064014,
    ...overrides,
  };
}

describe('decideEndTime', () => {
  // Suppress structured log noise from the combiner's caller-side logger
  // (decideEndTime itself does not log; submitCondition does).
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('priority table', () => {
    it('llm-high wins over PM endDate and regex', () => {
      const llmTs = toUnixTimestamp('2099-04-01T16:00:00Z');
      const c = makeCondition({
        llmEndTime: { ts: llmTs, confidence: 'high' },
        endDate: '2099-04-01T20:00:00Z',
        endTimeOverride: toUnixTimestamp('2099-04-02T23:59:00Z'),
        isTemplated: true,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(llmTs);
      expect(source).toBe('llm-high');
    });

    it('llm-low wins over PM endDate (always-LLM rule, confidence is telemetry)', () => {
      const llmTs = toUnixTimestamp('2099-04-01T23:59:00Z');
      const c = makeCondition({
        llmEndTime: { ts: llmTs, confidence: 'low' },
        endDate: '2099-04-01T16:00:00Z',
        isTemplated: false,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(llmTs);
      expect(source).toBe('llm-low');
    });

    it('llm-unknown (null ts) + PM endDate → pm-fallback', () => {
      const c = makeCondition({
        llmEndTime: { ts: null, confidence: 'unknown' },
        endDate: '2099-04-01T16:00:00Z',
        endTimeOverride: toUnixTimestamp('2099-04-02T23:59:00Z'),
        isTemplated: true,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(toUnixTimestamp('2099-04-01T16:00:00Z'));
      expect(source).toBe('pm-fallback');
    });

    it('no LLM result + PM endDate → pm-fallback', () => {
      const c = makeCondition({
        endDate: '2099-04-01T16:00:00Z',
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(toUnixTimestamp('2099-04-01T16:00:00Z'));
      expect(source).toBe('pm-fallback');
    });

    it('llm-unknown + no PM + templated + regex → regex-templated', () => {
      const regexTs = toUnixTimestamp('2099-04-01T23:59:00Z');
      const c = makeCondition({
        llmEndTime: { ts: null, confidence: 'unknown' },
        endDate: '',
        endTimeOverride: regexTs,
        isTemplated: true,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(regexTs);
      expect(source).toBe('regex-templated');
    });

    it('llm-unknown + no PM + NOT templated + regex → throws (regex not trusted)', () => {
      const c = makeCondition({
        llmEndTime: { ts: null, confidence: 'unknown' },
        endDate: '',
        endTimeOverride: toUnixTimestamp('2099-04-01T23:59:00Z'),
        isTemplated: false,
      });
      expect(() => decideEndTime(c)).toThrow(/no endTime source/);
    });

    it('no LLM + no PM + no regex → throws', () => {
      const c = makeCondition({ endDate: '' });
      expect(() => decideEndTime(c)).toThrow(/no endTime source/);
    });

    it('does NOT add the legacy END_TIME_BUFFER (4h)', () => {
      // The old combiner added 14400s (= 4h). The new one returns the
      // resolved ts verbatim. The bug class went away when the buffer left.
      const pmTs = toUnixTimestamp('2099-04-01T16:00:00Z');
      const c = makeCondition({ endDate: '2099-04-01T16:00:00Z' });
      expect(decideEndTime(c).ts).toBe(pmTs);
      // (the legacy value would have been pmTs + 14400)
      expect(decideEndTime(c).ts).not.toBe(pmTs + 14400);
    });
  });

  // Mocked-LLM regression fixtures — verifies the combiner produces the
  // correct final endTime under the realistic input shapes the new
  // pipeline emits. Pure: no Sonar calls, no token spend.
  describe('mocked golden fixtures', () => {
    it('ETH/USDT $1,800 (templated price candle, LLM returns noon ET high)', () => {
      // Prod bug: stored 2026-05-17T03:59Z (EOD May 16 ET); correct is noon ET.
      // Under the new pipeline, Sonar reads "noon ET" out of the description
      // and returns it with confidence: 'high'. decideEndTime picks LLM.
      const llmTs = toUnixTimestamp('2026-05-16T16:00:00Z');
      const c = makeCondition({
        conditionHash:
          '0x4444444444444444444444444444444444444444444444444444444444444444',
        question: 'Will the price of Ethereum be above $1,800 on May 16?',
        description:
          'This market resolves at 12:00 in the ET timezone (noon) on the date specified in the title.',
        endDate: '2026-05-16T16:00:00Z',
        // Regex would still return EOD-ish; under LLM-first it doesn't matter,
        // but mirror what the new descHasTimingMarker guard does (declines):
        endTimeOverride: undefined,
        llmEndTime: { ts: llmTs, confidence: 'high' },
        isTemplated: true,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(llmTs);
      expect(source).toBe('llm-high');
    });

    it('templated sports moneyline (LLM high, regex sport-duration ignored)', () => {
      // Sports markets normally hit regex tier 2a/2b with sport duration.
      // Under LLM-first the LLM answer wins; regex is irrelevant for the
      // create path. Verify the combiner picks LLM, not the regex value.
      const llmTs = toUnixTimestamp('2099-04-15T02:30:00Z'); // game-end UTC
      const c = makeCondition({
        question: 'Lakers vs Celtics: Moneyline',
        description: 'Scheduled for April 14 at 7:30 PM ET.',
        endDate: '2099-04-15T03:00:00Z', // PM endDate is close but not exact
        endTimeOverride: toUnixTimestamp('2099-04-15T03:00:00Z'), // regex 2a
        llmEndTime: { ts: llmTs, confidence: 'high' },
        isTemplated: true,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(llmTs);
      expect(source).toBe('llm-high');
    });

    it('one-off market with LLM low — uses LLM ts (always-LLM rule)', () => {
      // Non-templated one-off question. Sonar found only the date; returns
      // EOD with confidence: 'low'. We still take it (LLM always wins when
      // ts is non-null). PM endDate is also present so even a future
      // hallucination guard would have a fallback.
      const llmTs = toUnixTimestamp('2099-04-20T23:59:00Z');
      const c = makeCondition({
        question: 'Will Trump speak by April 20?',
        description:
          'Resolves YES if Trump speaks anywhere on or before April 20.',
        endDate: '2099-04-21T00:00:00Z',
        llmEndTime: { ts: llmTs, confidence: 'low' },
        isTemplated: false,
      });
      const { ts, source } = decideEndTime(c);
      expect(ts).toBe(llmTs);
      expect(source).toBe('llm-low');
    });
  });
});
