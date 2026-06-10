import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EndTimeEnrichmentInput } from '../llm/types';
import { buildEndTimePrompt, ENDTIME_SYSTEM_PROMPT } from '../llm/prompts';
import {
  parseEndTimeResponse,
  callOpenRouterForEndTime,
} from '../llm/openrouter';
import {
  extractEndTime,
  parseTimeStr,
  detectTzOffset,
  detectSportDuration,
  extractYear,
  toTs,
  descHasTimingMarker,
} from '../generate/endtime';

// ============ Test Helpers ============

function makeInput(
  overrides: Partial<EndTimeEnrichmentInput> = {}
): EndTimeEnrichmentInput {
  return {
    conditionId:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    question: 'Will Bitcoin hit $100k by March 15?',
    description: 'Market resolves Yes if BTC reaches $100,000.',
    eventTitle: 'Bitcoin Price',
    ...overrides,
  };
}

// ============ buildEndTimePrompt ============

describe('buildEndTimePrompt', () => {
  it("includes today's date", () => {
    const prompt = buildEndTimePrompt([makeInput()]);
    const today = new Date().toISOString().split('T')[0];
    expect(prompt).toContain(`TODAY'S DATE: ${today}`);
  });

  it('includes market question and id', () => {
    const input = makeInput();
    const prompt = buildEndTimePrompt([input]);
    expect(prompt).toContain(input.conditionId);
    expect(prompt).toContain(input.question);
  });

  it('includes full description without truncation', () => {
    const longDesc = 'A'.repeat(500);
    const prompt = buildEndTimePrompt([makeInput({ description: longDesc })]);
    expect(prompt).toContain('A'.repeat(500));
  });

  it('handles multiple markets', () => {
    const markets = [
      makeInput({
        conditionId:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      makeInput({
        conditionId:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ];
    const prompt = buildEndTimePrompt(markets);
    expect(prompt).toContain('0xaaaa');
    expect(prompt).toContain('0xbbbb');
  });
});

describe('ENDTIME_SYSTEM_PROMPT', () => {
  it('instructs JSON format with confidence field', () => {
    expect(ENDTIME_SYSTEM_PROMPT).toContain('JSON');
    expect(ENDTIME_SYSTEM_PROMPT).toContain('ISO8601');
    expect(ENDTIME_SYSTEM_PROMPT).toContain('confidence');
    expect(ENDTIME_SYSTEM_PROMPT).toContain('high');
    expect(ENDTIME_SYSTEM_PROMPT).toContain('low');
    expect(ENDTIME_SYSTEM_PROMPT).toContain('unknown');
  });
});

// ============ parseEndTimeResponse ============

describe('parseEndTimeResponse', () => {
  const id1 =
    '0x1111111111111111111111111111111111111111111111111111111111111111';
  const id2 =
    '0x2222222222222222222222222222222222222222222222222222222222222222';

  const markets = [
    makeInput({ conditionId: id1 }),
    makeInput({ conditionId: id2 }),
  ];

  it('parses valid CSV with ISO dates', () => {
    // Use dates far in the future so the test doesn't break as time passes
    const futureDate1 = '2099-04-01T12:00:00Z';
    const futureDate2 = '2099-05-15T23:59:59Z';
    const content = `${id1},${futureDate1}\n${id2},${futureDate2}`;
    const results = parseEndTimeResponse(content, markets);

    expect(results).toHaveLength(2);
    expect(results[0].conditionId).toBe(id1);
    expect(results[0].endTime).toBe(
      Math.floor(new Date(futureDate1).getTime() / 1000)
    );
    expect(results[1].conditionId).toBe(id2);
    expect(results[1].endTime).toBe(
      Math.floor(new Date(futureDate2).getTime() / 1000)
    );
  });

  it('returns null endTime for UNKNOWN', () => {
    // Far-future date so the parseEndTimeValue past-date guard doesn't
    // discard id2's endTime and break the assertion as wall-clock advances.
    const content = `${id1},UNKNOWN\n${id2},2099-05-15T23:59:59Z`;
    const results = parseEndTimeResponse(content, markets);

    expect(results).toHaveLength(2);
    const unknownResult = results.find((r) => r.conditionId === id1);
    expect(unknownResult?.endTime).toBeNull();
    const knownResult = results.find((r) => r.conditionId === id2);
    expect(knownResult?.endTime).not.toBeNull();
  });

  it('skips markdown code blocks and headers', () => {
    const content = `\`\`\`\n${id1},2026-04-01T12:00:00Z\n\`\`\``;
    const results = parseEndTimeResponse(content, markets);

    expect(results).toHaveLength(1);
    expect(results[0].conditionId).toBe(id1);
  });

  it('skips lines starting with id, header', () => {
    const content = `id,endTime\n${id1},2026-04-01T12:00:00Z`;
    const results = parseEndTimeResponse(content, markets);

    expect(results).toHaveLength(1);
    expect(results[0].conditionId).toBe(id1);
  });

  it('handles invalid dates gracefully', () => {
    // Far-future date so the parseEndTimeValue past-date guard doesn't
    // mask the "valid date" path under test as wall-clock advances.
    const content = `${id1},not-a-date\n${id2},2099-05-15T23:59:59Z`;
    const results = parseEndTimeResponse(content, markets);

    const validResults = results.filter((r) => r.endTime !== null);
    expect(validResults).toHaveLength(1);
    expect(validResults[0].conditionId).toBe(id2);
  });

  it('fuzzy matches slightly wrong IDs', () => {
    const wrongId = id1.slice(0, -1) + '2';
    const content = `${wrongId},2026-04-01T12:00:00Z`;
    const results = parseEndTimeResponse(content, markets);

    expect(results).toHaveLength(1);
    expect(results[0].conditionId).toBe(id1);
  });

  it('accepts past dates (already-resolved events return when the outcome became known)', () => {
    // Sonar's prompt explicitly returns the past resolution timestamp for
    // events that have already happened — that's the right answer for
    // endTime, not a near-future placeholder. The parser must let it through.
    const pastDate = '2020-01-01T00:00:00Z';
    const content = `${id1},${pastDate}`;
    const results = parseEndTimeResponse(content, markets);

    const result = results.find((r) => r.conditionId === id1);
    expect(result?.endTime).toBe(
      Math.floor(new Date(pastDate).getTime() / 1000)
    );
  });

  it('handles empty response', () => {
    const results = parseEndTimeResponse('', markets);
    expect(results).toHaveLength(0);
  });

  describe('JSON response format (new)', () => {
    it('parses JSON array with high confidence', () => {
      const futureDate = '2099-04-01T16:00:00Z';
      const content = JSON.stringify([
        { id: id1, ts: futureDate, confidence: 'high' },
      ]);
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].conditionId).toBe(id1);
      expect(results[0].endTime).toBe(
        Math.floor(new Date(futureDate).getTime() / 1000)
      );
      expect(results[0].confidence).toBe('high');
    });

    it('parses JSON array with low confidence + EOD timestamp', () => {
      const eod = '2099-04-01T23:59:59Z';
      const content = JSON.stringify([{ id: id1, ts: eod, confidence: 'low' }]);
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe('low');
      expect(results[0].endTime).not.toBeNull();
    });

    it('parses JSON array with unknown confidence + null ts', () => {
      const content = JSON.stringify([
        { id: id1, ts: null, confidence: 'unknown' },
      ]);
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe('unknown');
      expect(results[0].endTime).toBeNull();
    });

    it('strips ```json fences before parsing', () => {
      const futureDate = '2099-04-01T16:00:00Z';
      const content = `\`\`\`json\n${JSON.stringify([
        { id: id1, ts: futureDate, confidence: 'high' },
      ])}\n\`\`\``;
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].endTime).toBe(
        Math.floor(new Date(futureDate).getTime() / 1000)
      );
    });

    it('falls back to CSV when JSON is malformed', () => {
      // Not valid JSON; parser falls through to CSV. Confidence synthesized.
      const content = `${id1},2099-04-01T16:00:00Z`;
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].endTime).not.toBeNull();
      expect(results[0].confidence).toBe('low'); // CSV → synthesized low
    });

    it('CSV with UNKNOWN gets synthesized unknown confidence', () => {
      const content = `${id1},UNKNOWN`;
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].endTime).toBeNull();
      expect(results[0].confidence).toBe('unknown');
    });

    it('JSON entry with missing confidence field falls back to inferred', () => {
      const futureDate = '2099-04-01T16:00:00Z';
      const content = JSON.stringify([{ id: id1, ts: futureDate }]);
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe('low'); // ts present, confidence missing → low
    });

    it('JSON entry with invalid confidence value falls back to inferred', () => {
      const futureDate = '2099-04-01T16:00:00Z';
      const content = JSON.stringify([
        { id: id1, ts: futureDate, confidence: 'maybe' },
      ]);
      const results = parseEndTimeResponse(content, markets);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe('low');
    });
  });
});

// ============ parseTimeStr ============

describe('parseTimeStr', () => {
  it('parses HH:MM AM/PM', () => {
    expect(parseTimeStr('1:10PM')).toEqual({ h: 13, m: 10 });
    expect(parseTimeStr('12:00PM')).toEqual({ h: 12, m: 0 });
    expect(parseTimeStr('12:00AM')).toEqual({ h: 0, m: 0 });
    expect(parseTimeStr('7:30 PM')).toEqual({ h: 19, m: 30 });
  });

  it('parses HH:MM (24h, no AM/PM)', () => {
    expect(parseTimeStr('14:30')).toEqual({ h: 14, m: 30 });
    expect(parseTimeStr('0:00')).toEqual({ h: 0, m: 0 });
  });

  it('parses H AM/PM (no minutes)', () => {
    expect(parseTimeStr('9 PM')).toEqual({ h: 21, m: 0 });
    expect(parseTimeStr('9 AM')).toEqual({ h: 9, m: 0 });
    expect(parseTimeStr('12 PM')).toEqual({ h: 12, m: 0 });
    expect(parseTimeStr('12 AM')).toEqual({ h: 0, m: 0 });
  });

  it('returns null for invalid input', () => {
    expect(parseTimeStr('not a time')).toBeNull();
    expect(parseTimeStr('')).toBeNull();
  });
});

// ============ detectTzOffset ============

describe('detectTzOffset', () => {
  it('returns -4 for ET/EDT/EST', () => {
    expect(detectTzOffset('ET')).toBe(-4);
    expect(detectTzOffset('EDT')).toBe(-4);
    expect(detectTzOffset('EST')).toBe(-4);
    expect(detectTzOffset('7:30 PM ET')).toBe(-4);
  });

  it('returns -5 for CT/CDT/CST', () => {
    expect(detectTzOffset('CT')).toBe(-5);
    expect(detectTzOffset('CST')).toBe(-5);
  });

  it('returns -7 for PT/PDT/PST', () => {
    expect(detectTzOffset('PT')).toBe(-7);
    expect(detectTzOffset('PDT')).toBe(-7);
    expect(detectTzOffset('9 AM PT')).toBe(-7);
  });

  it('returns 0 for UTC/GMT', () => {
    expect(detectTzOffset('UTC')).toBe(0);
    expect(detectTzOffset('GMT')).toBe(0);
    expect(detectTzOffset('12:00 PM UTC')).toBe(0);
  });

  it('returns 2 for CET/CEST', () => {
    expect(detectTzOffset('CET')).toBe(2);
    expect(detectTzOffset('CEST')).toBe(2);
  });

  it('returns null for unrecognised', () => {
    expect(detectTzOffset('no timezone here')).toBeNull();
    expect(detectTzOffset('')).toBeNull();
  });
});

// ============ detectSportDuration ============

describe('detectSportDuration', () => {
  it('returns correct durations', () => {
    expect(detectSportDuration('NBA game tonight')).toBe(3);
    expect(detectSportDuration('UFC fight card')).toBe(5);
    expect(detectSportDuration('cricket match in India')).toBe(8);
    expect(detectSportDuration('soccer match')).toBe(2.5);
    expect(detectSportDuration('nfl game')).toBe(3.5);
    expect(detectSportDuration('hockey game')).toBe(3);
    expect(detectSportDuration('golf tournament')).toBe(6);
  });

  it('returns null when no sport keyword found', () => {
    expect(detectSportDuration('Will Bitcoin reach $200k?')).toBeNull();
    expect(detectSportDuration('Fed rate decision')).toBeNull();
  });
});

// ============ extractYear ============

describe('extractYear', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-03-24T12:00:00Z').getTime() });
  });
  afterEach(() => vi.useRealTimers());

  it('returns current year for future dates', () => {
    expect(extractYear(4, 5)).toBe(2026); // Apr 5 — future
    expect(extractYear(3, 25)).toBe(2026); // Mar 25 — tomorrow
  });

  it('returns current year for today', () => {
    expect(extractYear(3, 24)).toBe(2026); // Mar 24 — today
  });

  it('rolls to next year for dates more than 1 day past', () => {
    expect(extractYear(1, 14)).toBe(2027); // Jan 14 — 2+ months past
    expect(extractYear(3, 19)).toBe(2027); // Mar 19 — 5 days past
  });
});

// ============ toTs ============

describe('toTs', () => {
  it('converts local time to UTC unix timestamp', () => {
    // 2 PM ET (UTC-4) = 6 PM UTC
    expect(toTs(2026, 4, 5, 14, 0, -4)).toBe(
      Math.floor(new Date('2026-04-05T18:00:00Z').getTime() / 1000)
    );
    // Noon UTC = noon UTC
    expect(toTs(2026, 4, 1, 12, 0, 0)).toBe(
      Math.floor(new Date('2026-04-01T12:00:00Z').getTime() / 1000)
    );
  });

  it('defaults to 23:59 UTC when no time given', () => {
    expect(toTs(2026, 4, 30)).toBe(
      Math.floor(new Date('2026-04-30T23:59:00Z').getTime() / 1000)
    );
  });

  it('handles date boundary crossing (8 PM ET = midnight UTC)', () => {
    // 8 PM ET (UTC-4) = Apr 6 00:00 UTC
    expect(toTs(2026, 4, 5, 20, 0, -4)).toBe(
      Math.floor(new Date('2026-04-06T00:00:00Z').getTime() / 1000)
    );
  });
});

// ============ extractEndTime ============

describe('extractEndTime', () => {
  // Freeze time to a fixed reference point so extractYear is deterministic
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-03-24T12:00:00Z').getTime() });
  });
  afterEach(() => vi.useRealTimers());

  // ── Tier 0 ────────────────────────────────────────────────────────────────
  describe('tier 0 — crypto up/down', () => {
    it('parses "Up or Down – Apr 5, 2:00 PM ET"', () => {
      // Apr 5 2:00 PM ET (UTC-4) = Apr 5 18:00 UTC
      expect(extractEndTime('Up or Down – Apr 5, 2:00 PM ET', '')).toBe(
        Math.floor(new Date('2026-04-05T18:00:00Z').getTime() / 1000)
      );
    });

    it('rolls to next year when date is past', () => {
      // Jan 14 is past → 2027; January = winter, so PT = PST (UTC-8).
      // 9 AM PST = 17:00 UTC. (Pre-DST-fix this test asserted UTC-7 = 16:00.)
      expect(extractEndTime('Up or Down – Jan 14, 9:00 AM PT', '')).toBe(
        Math.floor(new Date('2027-01-14T17:00:00Z').getTime() / 1000)
      );
    });

    it('uses explicit year when provided', () => {
      expect(extractEndTime('Up or Down – Apr 5, 2027, 2:00 PM ET', '')).toBe(
        Math.floor(new Date('2027-04-05T18:00:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 1a ───────────────────────────────────────────────────────────────
  describe('tier 1a — Pyth price', () => {
    it('parses "price of BTC ... on April 1 at 12:00 PM UTC"', () => {
      expect(
        extractEndTime(
          'Will the price of BTC be above $100k on April 1 at 12:00 PM UTC?',
          ''
        )
      ).toBe(Math.floor(new Date('2026-04-01T12:00:00Z').getTime() / 1000));
    });
  });

  // ── Tier 1c ───────────────────────────────────────────────────────────────
  describe('tier 1c — resolves by with time (description)', () => {
    it('parses "resolve by April 10 at 5:00 PM ET" from description', () => {
      // Apr 10 5 PM ET (UTC-4) = 21:00 UTC
      expect(
        extractEndTime('', 'This market will resolve by April 10 at 5:00 PM ET')
      ).toBe(Math.floor(new Date('2026-04-10T21:00:00Z').getTime() / 1000));
    });

    it('requires description to contain resolve pattern (tier 1c is desc-only)', () => {
      // Same date, same time — but in question not description
      // tier 1c won't match, but tier 4c ("April 10 at 5:00 PM ET") still fires → same ts
      // This just confirms the result is non-null regardless of which tier fires
      const result = extractEndTime('Resolves by April 10 at 5:00 PM ET', '');
      expect(result).not.toBeNull();
    });
  });

  // ── Tier 1d ───────────────────────────────────────────────────────────────
  describe('tier 1d — on Month Day at Time', () => {
    it('parses "on April 5 at 8:00 PM ET"', () => {
      // 8 PM ET (UTC-4) = Apr 6 00:00 UTC
      expect(
        extractEndTime('Will X happen on April 5 at 8:00 PM ET?', '')
      ).toBe(Math.floor(new Date('2026-04-06T00:00:00Z').getTime() / 1000));
    });

    it('parses "on April 1 at 12:00 UTC"', () => {
      expect(extractEndTime('Will X happen on April 1 at 12:00 UTC?', '')).toBe(
        Math.floor(new Date('2026-04-01T12:00:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 1e ───────────────────────────────────────────────────────────────
  describe('tier 1e — "by Month Day, Year, HH:MM AM/PM TZ" deadline in desc', () => {
    it('Ryanair-style deadline (year + comma + time + TZ)', () => {
      // June 30 = EDT (UTC-4), 11:59 PM EDT = July 1 03:59 UTC
      const ts = extractEndTime(
        'Will Elon Musk buy Ryanair?',
        '...enters into an agreement to buy Ryanair by June 30, 2026, 11:59 PM ET. Otherwise...'
      );
      expect(ts).toBe(
        Math.floor(new Date('2026-07-01T03:59:00Z').getTime() / 1000)
      );
    });

    it('reports tier 1e', () => {
      const out = { tier: '' };
      extractEndTime(
        'Will X happen?',
        'must happen by July 4, 2026, 5:00 PM ET',
        out
      );
      expect(out.tier).toBe('1e');
    });

    it('no year given → inferred from current year', () => {
      // Aug 15 is in the future; should infer 2026
      const ts = extractEndTime(
        'Will X happen?',
        'event must occur by August 15, 11:59 PM ET'
      );
      // Aug = EDT (UTC-4), 23:59 EDT = Aug 16 03:59 UTC
      expect(ts).toBe(
        Math.floor(new Date('2026-08-16T03:59:00Z').getTime() / 1000)
      );
    });

    it('no TZ given → falls back to UTC', () => {
      // No TZ → 0 offset, 11:59 PM treated as UTC
      const ts = extractEndTime(
        'Will X happen?',
        'must occur by Dec 1, 2026, 11:59 PM'
      );
      expect(ts).toBe(
        Math.floor(new Date('2026-12-01T23:59:00Z').getTime() / 1000)
      );
    });

    it('requires AM/PM — bare "by Jan 5" does NOT match this tier', () => {
      // No time-of-day → tier 1e declines; other tiers may catch it
      const out = { tier: '' };
      extractEndTime('Will X happen?', 'must occur by Jan 5, 2026', out);
      // Should match some other tier (4a/4b/4d), NOT 1e
      expect(out.tier).not.toBe('1e');
    });

    it('does NOT swallow a past-tense "by" with no time', () => {
      // "by Friday" with no time/TZ → declines (no AM/PM in time component)
      const out = { tier: '' };
      extractEndTime(
        'Will X happen?',
        'announcements made by Friday will not qualify',
        out
      );
      expect(out.tier).not.toBe('1e');
    });

    it('skips cancellation-fallback "by [date] ... resolve to Other" (straight quotes)', () => {
      const out = { tier: '' };
      extractEndTime(
        'Will Uzbekistan win the 2026 FIFA World Cup?',
        'If the 2026 FIFA World Cup is permanently canceled or has not been completed by October 13, 2026, 11:59 PM this market will resolve to "Other".',
        out
      );
      expect(out.tier).not.toBe('1e');
    });

    it('skips cancellation-fallback with curly quotes (real Polymarket shape)', () => {
      // Polymarket descriptions use U+201C/201D (curly double quotes) around
      // outcome names; the guard must match those too.
      const out = { tier: '' };
      extractEndTime(
        'Will Uzbekistan win the 2026 FIFA World Cup?',
        'If the 2026 FIFA World Cup is permanently canceled or has not been completed by October 13, 2026, 11:59 PM this market will resolve to “Other”.',
        out
      );
      expect(out.tier).not.toBe('1e');
    });

    it('still catches a real deadline that appears AFTER a fallback in same description', () => {
      // Description has two "by [date]" — a fallback first, a real deadline
      // second. Iterative scan should skip the fallback and accept the real one.
      const ts = extractEndTime(
        'Will X happen?',
        'If X is canceled by Aug 1, 2026, 11:59 PM ET this market will resolve to "Other". Otherwise this market will resolve YES if X happens by July 4, 2026, 11:59 PM ET.'
      );
      // July 4 = EDT (UTC-4), 23:59 EDT = July 5 03:59 UTC
      expect(ts).toBe(
        Math.floor(new Date('2026-07-05T03:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 2a ───────────────────────────────────────────────────────────────
  describe('tier 2a — scheduled with time + sport duration', () => {
    it('adds NBA duration (3h) to start time', () => {
      // Apr 5 7:30 PM ET = Apr 5 23:30 UTC; +3h = Apr 6 02:30 UTC
      expect(
        extractEndTime(
          'NBA: Lakers vs Celtics scheduled for April 5 at 7:30 PM ET',
          ''
        )
      ).toBe(Math.floor(new Date('2026-04-06T02:30:00Z').getTime() / 1000));
    });

    it('adds UFC duration (5h) to start time', () => {
      // Apr 5 7:30 PM ET = Apr 5 23:30 UTC; +5h = Apr 6 04:30 UTC
      expect(
        extractEndTime('UFC fight card scheduled for April 5 at 7:30 PM ET', '')
      ).toBe(Math.floor(new Date('2026-04-06T04:30:00Z').getTime() / 1000));
    });

    it('uses default 3h when no sport detected', () => {
      // Apr 5 7:30 PM ET = Apr 5 23:30 UTC; +3h = Apr 6 02:30 UTC
      expect(
        extractEndTime('Event scheduled for April 5 at 7:30 PM ET', '')
      ).toBe(Math.floor(new Date('2026-04-06T02:30:00Z').getTime() / 1000));
    });
  });

  // ── Tier 2b ───────────────────────────────────────────────────────────────
  describe('tier 2b — scheduled date only', () => {
    it('no sport keyword and no US/UK context → 23:59 UTC (no pad)', () => {
      // Previously stamped EOD + 4h "sport duration" pad even for non-sports;
      // now stamps a clean 23:59 UTC when nothing identifies a timezone.
      expect(extractEndTime('Event scheduled for April 5', '')).toBe(
        Math.floor(new Date('2026-04-05T23:59:00Z').getTime() / 1000)
      );
    });

    it('soccer keyword → still uses soccer duration pad (2.5h)', () => {
      // Apr 5 23:59 UTC + 2.5h (9000s) = Apr 6 02:29 UTC
      expect(extractEndTime('Soccer match scheduled for April 5', '')).toBe(
        Math.floor(new Date('2026-04-06T02:29:00Z').getTime() / 1000)
      );
    });

    it('US-presidential context, winter date → 23:59 EST (UTC-5)', () => {
      // The Tim Walz prod bug: regex previously returned 23:59 EDT
      // because the +4h pad effectively bakes in a UTC-4 assumption,
      // which is wrong in November (EST is UTC-5).
      expect(
        extractEndTime(
          'Will Tim Walz win the 2028 US Presidential Election?',
          'The 2028 US Presidential Election is scheduled to take place on November 7, 2028.'
        )
      ).toBe(Math.floor(new Date('2028-11-08T04:59:00Z').getTime() / 1000));
    });

    it('US context, summer date → 23:59 EDT (UTC-4)', () => {
      // July 4 is EDT (UTC-4): 23:59 local = 03:59 UTC next day.
      expect(
        extractEndTime(
          'Will the President declare a holiday?',
          'Independence Day is scheduled to take place on July 4, 2026.'
        )
      ).toBe(Math.floor(new Date('2026-07-05T03:59:00Z').getTime() / 1000));
    });

    it('UK context, summer date → 23:59 BST (UTC+1)', () => {
      // BST (British Summer Time) is UTC+1; 23:59 BST = 22:59 UTC.
      expect(
        extractEndTime(
          'Will the British Prime Minister resign?',
          'The next general election in the United Kingdom is scheduled for June 15, 2026.'
        )
      ).toBe(Math.floor(new Date('2026-06-15T22:59:00Z').getTime() / 1000));
    });

    it('UK context, winter date → 23:59 GMT (UTC+0)', () => {
      // GMT is UTC+0; 23:59 GMT = 23:59 UTC same day.
      expect(
        extractEndTime(
          'Will Parliament vote no confidence?',
          'The Westminster vote is scheduled for January 15, 2027.'
        )
      ).toBe(Math.floor(new Date('2027-01-15T23:59:00Z').getTime() / 1000));
    });

    it('the pronoun "us" does NOT infer a US timezone → 23:59 UTC', () => {
      // Regression: context inference must key off the country abbreviation
      // "US", not the lowercase pronoun "us". A non-US market that merely says
      // "join us" should fall back to UTC, not America/New_York.
      expect(
        extractEndTime(
          'Will the team win the cup?',
          'Join us — the final is scheduled to take place on January 15, 2027.'
        )
      ).toBe(Math.floor(new Date('2027-01-15T23:59:00Z').getTime() / 1000));
    });

    it('explicit timezone abbreviation overrides context', () => {
      // Question carries US-themed words but description names PT explicitly;
      // PT should win — and DST-aware (PDT = UTC-7 in July).
      expect(
        extractEndTime(
          'Will the US congressional vote pass?',
          'The vote is scheduled to take place on July 4, 2026 PT.'
        )
      ).toBe(Math.floor(new Date('2026-07-05T06:59:00Z').getTime() / 1000));
    });
  });

  // ── Tier 2c ───────────────────────────────────────────────────────────────
  describe('tier 2c — scheduled for YYYY-MM-DD (ISO date in description)', () => {
    it('parses ISO date from description with hockey duration', () => {
      // 2026-04-05 23:59 UTC + 3h (hockey) = 2026-04-06 02:59 UTC
      expect(
        extractEndTime(
          'Will the Bakersfield Condors win this hockey game?',
          'The game is scheduled for 2026-04-05. Resolution source: AHL.'
        )
      ).toBe(Math.floor(new Date('2026-04-06T02:59:00Z').getTime() / 1000));
    });

    it('parses ISO date from question without sport context → 23:59 UTC', () => {
      // No sport keyword, no US/UK context → falls back to UTC, no pad.
      expect(extractEndTime('Match scheduled for 2026-04-10', '')).toBe(
        Math.floor(new Date('2026-04-10T23:59:00Z').getTime() / 1000)
      );
    });

    it('reports tier 2c', () => {
      const out = { tier: '' };
      extractEndTime('Match scheduled for 2026-04-10', '', out);
      expect(out.tier).toBe('2c');
    });

    it('uses sport duration when sport keyword present', () => {
      // 2026-04-10 23:59 UTC + 2.5h (soccer) = 2026-04-11 02:29 UTC
      expect(
        extractEndTime('Soccer: Foo vs Bar scheduled for 2026-04-10', '')
      ).toBe(Math.floor(new Date('2026-04-11T02:29:00Z').getTime() / 1000));
    });
  });

  // ── Tier 3a ───────────────────────────────────────────────────────────────
  describe('tier 3a — resolves by date (description)', () => {
    it('parses "resolves by April 30" from description', () => {
      expect(extractEndTime('', 'This market resolves by April 30')).toBe(
        Math.floor(new Date('2026-04-30T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 3b ───────────────────────────────────────────────────────────────
  describe('tier 3b — checked/measured on date (description)', () => {
    it('parses "measured on April 10" from description', () => {
      expect(extractEndTime('', 'Price will be measured on April 10')).toBe(
        Math.floor(new Date('2026-04-10T23:59:00Z').getTime() / 1000)
      );
    });

    it('parses "checked on April 20" from description', () => {
      expect(extractEndTime('', 'Value will be checked on April 20')).toBe(
        Math.floor(new Date('2026-04-20T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4 weather ────────────────────────────────────────────────────────
  describe('tier 4 — weather + city timezone', () => {
    it('uses NYC timezone (UTC-4) for New York weather', () => {
      // Apr 5 23:59 NYC (UTC-4) = Apr 6 03:59 UTC
      expect(extractEndTime('Will it rain in New York on April 5?', '')).toBe(
        Math.floor(new Date('2026-04-06T03:59:00Z').getTime() / 1000)
      );
    });

    it('uses LA timezone (UTC-7) for Los Angeles weather', () => {
      // Apr 10 23:59 LA (UTC-7) = Apr 11 06:59 UTC
      expect(
        extractEndTime('High temperature in Los Angeles on April 10?', '')
      ).toBe(Math.floor(new Date('2026-04-11T06:59:00Z').getTime() / 1000));
    });

    it('defaults to UTC when no city found', () => {
      expect(extractEndTime('Will it snow on April 5?', '')).toBe(
        Math.floor(new Date('2026-04-05T23:59:00Z').getTime() / 1000)
      );
    });

    it('uses end date of range "Month D1-D2" (date range fix)', () => {
      // "April 10-16" → use 16, Apr 16 23:59 UTC-4 = Apr 17 03:59 UTC
      expect(
        extractEndTime(
          'Will temperature in New York be above 60°F April 10-16?',
          ''
        )
      ).toBe(Math.floor(new Date('2026-04-17T03:59:00Z').getTime() / 1000));
    });
  });

  // ── Tier 4a ───────────────────────────────────────────────────────────────
  describe('tier 4a — by Month Day, Year', () => {
    it('parses "by April 30, 2027"', () => {
      expect(extractEndTime('Will X happen by April 30, 2027?', '')).toBe(
        Math.floor(new Date('2027-04-30T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4b ───────────────────────────────────────────────────────────────
  describe('tier 4b — on Month Day, Year', () => {
    it('parses "on January 20, 2027"', () => {
      expect(extractEndTime('Will X happen on January 20, 2027?', '')).toBe(
        Math.floor(new Date('2027-01-20T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4c ───────────────────────────────────────────────────────────────
  describe('tier 4c — Month Day at Time', () => {
    it('parses "April 5 at 7 PM ET"', () => {
      // Apr 5 7 PM ET (UTC-4) = Apr 5 23:00 UTC
      expect(extractEndTime('April 5 at 7 PM ET', '')).toBe(
        Math.floor(new Date('2026-04-05T23:00:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4d ───────────────────────────────────────────────────────────────
  describe('tier 4d — by Month Day (no year)', () => {
    it('uses current year for future dates', () => {
      expect(extractEndTime('Will Bitcoin reach $200k by April 30?', '')).toBe(
        Math.floor(new Date('2026-04-30T23:59:00Z').getTime() / 1000)
      );
    });

    it('rolls to next year for past dates', () => {
      // Mar 10 is past → 2027
      expect(extractEndTime('Will X happen by March 10?', '')).toBe(
        Math.floor(new Date('2027-03-10T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4e ───────────────────────────────────────────────────────────────
  describe('tier 4e — on/for Month Day (no year)', () => {
    it('rolls to next year for past dates', () => {
      // Mar 19 is 5 days past → 2027
      expect(extractEndTime('Will the Fed cut rates on March 19?', '')).toBe(
        Math.floor(new Date('2027-03-19T23:59:00Z').getTime() / 1000)
      );
    });

    it('uses current year for future dates', () => {
      expect(extractEndTime('Will it happen on April 15?', '')).toBe(
        Math.floor(new Date('2026-04-15T23:59:00Z').getTime() / 1000)
      );
    });

    it('parses "for March 27" (TSA-style market)', () => {
      // Mar 27 is 3 days in the future from fake-now (Mar 24)
      expect(
        extractEndTime(
          'Will the total number of TSA passengers for March 27 be less than 2,600,000?',
          ''
        )
      ).toBe(Math.floor(new Date('2026-03-27T23:59:00Z').getTime() / 1000));
    });

    it('parses "for April 15" (future date)', () => {
      expect(extractEndTime('Will X be reported for April 15?', '')).toBe(
        Math.floor(new Date('2026-04-15T23:59:00Z').getTime() / 1000)
      );
    });

    it('uses end date of range "Month D1-D2" (date range fix)', () => {
      // "March 23-29" → use 29; Mar 29 is future → 2026
      expect(extractEndTime('Will X happen on March 23-29?', '')).toBe(
        Math.floor(new Date('2026-03-29T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier 4stock ───────────────────────────────────────────────────────────
  describe('tier 4stock — stock weekly "week of Month Day"', () => {
    const stockDesc =
      'This market will resolve to "Yes" if the official closing price on the final day of trading of the specified week (normally Friday) is higher than the listed price.';

    it('returns Friday 20:00 UTC for "week of March 23" (Monday)', () => {
      // March 23 (Mon) + 4 = March 27 (Fri) at 20:00 UTC
      expect(
        extractEndTime(
          'Will Palantir (PLTR) finish week of March 23 above $157?',
          stockDesc
        )
      ).toBe(Math.floor(new Date('2026-03-27T20:00:00Z').getTime() / 1000));
    });

    it('handles month boundary (week of March 30 → Friday April 3)', () => {
      // March 30 (Mon) + 4 = April 3 (Fri) at 20:00 UTC
      expect(
        extractEndTime(
          'Will TSLA finish week of March 30 above $300?',
          stockDesc
        )
      ).toBe(Math.floor(new Date('2026-04-03T20:00:00Z').getTime() / 1000));
    });

    it('requires "final day of trading" in description — no match without it', () => {
      // Without the description signal, falls through to a different tier or null
      // Should NOT be tier 4stock (may still match another tier or null)
      const out = { tier: '' };
      extractEndTime(
        'Will TSLA finish week of March 30 above $300?',
        'Other desc.',
        out
      );
      expect(out.tier).not.toBe('4stock');
    });

    it('reports tier 4stock', () => {
      const out = { tier: '' };
      extractEndTime(
        'Will PLTR finish week of March 23 above $150?',
        stockDesc,
        out
      );
      expect(out.tier).toBe('4stock');
    });
  });

  // ── Tier 4f ───────────────────────────────────────────────────────────────
  describe('tier 4f — Month Day, Year in question', () => {
    it('parses "January 14, 2027"', () => {
      expect(extractEndTime('Will X happen before January 14, 2027?', '')).toBe(
        Math.floor(new Date('2027-01-14T23:59:00Z').getTime() / 1000)
      );
    });
  });

  // ── Tier priority ─────────────────────────────────────────────────────────
  describe('tier priority — first match wins', () => {
    it('tier 1d wins over tier 4d when both match in same text', () => {
      // "on April 1 at 12:00 UTC" triggers tier 1d; "by April 30" would be tier 4d
      expect(
        extractEndTime('Will X happen on April 1 at 12:00 UTC by April 30?', '')
      ).toBe(Math.floor(new Date('2026-04-01T12:00:00Z').getTime() / 1000));
    });
  });

  // ── "initially scheduled" suppression ────────────────────────────────────
  describe('"initially scheduled" suppression', () => {
    it('returns null when only date is in "initially scheduled for" clause', () => {
      expect(
        extractEndTime(
          'Valorant: Team A vs Team B (BO3)',
          'This market refers to the match, initially scheduled for March 17 at 6:00PM ET.\n\nThis market will resolve to "Team A" if Team A wins.'
        )
      ).toBeNull();
    });

    it('still finds a rescheduled date in a later clause', () => {
      // "initially scheduled for March 17" stripped; "rescheduled for April 5 at 8PM ET" survives
      // tier 2a: scheduled April 5 8PM ET (UTC-4) = April 6 00:00 UTC + 4h sport = Apr 6 04:00 UTC
      expect(
        extractEndTime(
          'Valorant: Team A vs Team B (BO3)',
          'This market refers to the match, initially scheduled for March 17 at 6:00PM ET.\n\nMatch rescheduled for April 5 at 8:00PM ET.'
        )
      ).toBe(Math.floor(new Date('2026-04-06T04:00:00Z').getTime() / 1000));
    });

    it('does not suppress plain "scheduled for" (no "initially")', () => {
      // Normal scheduled match should still be extracted
      expect(
        extractEndTime(
          'NBA: Lakers vs Celtics',
          'This market is scheduled for April 5 at 7:30 PM ET.'
        )
      ).toBe(Math.floor(new Date('2026-04-06T02:30:00Z').getTime() / 1000));
    });
  });

  // ── tier out parameter ─────────────────────────────────────────────────────
  describe('out.tier parameter', () => {
    it('reports correct tier', () => {
      const out = { tier: '' };
      extractEndTime('Will TSA passengers for March 27 be less?', '', out);
      expect(out.tier).toBe('4e');
    });

    it('reports tier 6 when no match', () => {
      const out = { tier: '' };
      extractEndTime('Will X ever happen?', '', out);
      expect(out.tier).toBe('6');
    });

    it('reports tier 2b for scheduled date-only', () => {
      const out = { tier: '' };
      extractEndTime('Event scheduled for April 5', '', out);
      expect(out.tier).toBe('2b');
    });
  });

  // ── Tier 4month ───────────────────────────────────────────────────────────
  describe('tier 4month — crypto "in [Month]" monthly markets', () => {
    it('returns last day of March at 23:59 UTC for "in March"', () => {
      // March 31 23:59 UTC
      expect(extractEndTime('Will Bitcoin reach $100,000 in March?', '')).toBe(
        Math.floor(new Date('2026-03-31T23:59:00Z').getTime() / 1000)
      );
    });

    it('handles explicit year "in March 2027"', () => {
      expect(
        extractEndTime('Will Bitcoin reach $200,000 in March 2027?', '')
      ).toBe(Math.floor(new Date('2027-03-31T23:59:00Z').getTime() / 1000));
    });

    it('handles month boundary — April has 30 days', () => {
      expect(extractEndTime('Will Ethereum reach $5,000 in April?', '')).toBe(
        Math.floor(new Date('2026-04-30T23:59:00Z').getTime() / 1000)
      );
    });

    it('does NOT match non-crypto "in March" (avoids false positives)', () => {
      const out = { tier: '' };
      extractEndTime('Will the Fed cut rates in March?', '', out);
      expect(out.tier).not.toBe('4month');
    });

    it('reports tier 4month', () => {
      const out = { tier: '' };
      extractEndTime('Will XRP reach $3 in April?', '', out);
      expect(out.tier).toBe('4month');
    });
  });

  // ── Tier 4month2 — generalised "in [Month]" ────────────────────────────────
  describe('tier 4month2 — non-crypto "in [Month]" markets', () => {
    it('resolves "in April?" to last day of April', () => {
      const out = { tier: '' };
      const ts = extractEndTime('Will Elon post 50+ tweets in April?', '', out);
      expect(out.tier).toBe('4month2');
      const d = new Date(ts! * 1000);
      expect(d.getUTCMonth()).toBe(3); // April = 3 (0-indexed)
      expect(d.getUTCDate()).toBe(30);
    });

    it('resolves "in April 2026?" with explicit year', () => {
      const out = { tier: '' };
      const ts = extractEndTime(
        'Will SpaceX have exactly 12 launches in April 2026?',
        '',
        out
      );
      expect(out.tier).toBe('4month2');
      expect(ts).toBe(
        Math.floor(new Date('2026-04-30T23:59:00Z').getTime() / 1000)
      );
    });

    it('excludes Fed / central bank questions', () => {
      const cases = [
        'Will the Fed cut rates in April?',
        'Will the ECB cut rates in June?',
        'Will the FOMC cut by 25 bps in June?',
        'Fed holds rates steady in April?',
        'Will the Fed funds rate be above 4% in May?',
        'Will the Fed raise interest rates in May 2026?',
      ];
      for (const q of cases) {
        const out = { tier: '' };
        extractEndTime(q, '', out);
        expect(out.tier).not.toBe('4month2');
      }
    });

    it('does not match crypto — those hit tier 4month', () => {
      const out = { tier: '' };
      extractEndTime('Will Bitcoin reach $100k in March?', '', out);
      expect(out.tier).toBe('4month');
    });
  });

  // ── Tier 4week — "this week" ──────────────────────────────────────────────
  describe('tier 4week — "this week" markets', () => {
    it('resolves "this week" to next Sunday 23:59 ET', () => {
      const out = { tier: '' };
      const ts = extractEndTime(
        'Will Trump post "Crypto" this week on Truth Social?',
        '',
        out
      );
      expect(out.tier).toBe('4week');
      expect(ts).not.toBeNull();
      // Should land on a Sunday
      const d = new Date(ts! * 1000);
      // 03:59 UTC = 23:59 ET (UTC-4), so the ET date is Saturday night → Sunday
      // The UTC day might be Monday (03:59 UTC Monday = 23:59 ET Sunday)
      // Check that the ET day is Sunday (0)
      const etDate = new Date(d.getTime() - 4 * 3600 * 1000);
      expect(etDate.getUTCDay()).toBe(0); // Sunday
    });

    it('does not match "last week" or "next week"', () => {
      expect(extractEndTime('What happened last week?', '')).toBeNull();
    });
  });

  // ── Weather tier bug fix ──────────────────────────────────────────────────
  describe('tier 4weather — decimal number bug fix', () => {
    it('does not false-match "1.10ºC in April 2026" as April 20', () => {
      const out = { tier: '' };
      const ts = extractEndTime(
        'Will global temperature increase by less than 1.10ºC in April 2026?',
        '',
        out
      );
      // Should NOT be 4weather with day=20; should fall through to 4month2
      expect(out.tier).toBe('4month2');
      const d = new Date(ts! * 1000);
      expect(d.getUTCMonth()).toBe(3); // April
      expect(d.getUTCDate()).toBe(30); // end of month, not 20
    });

    it('does not grab dates from description fallback clauses', () => {
      const out = { tier: '' };
      const ts = extractEndTime(
        'Will global temperature increase by less than 1.10ºC in April 2026?',
        'If no data by June 1, 2026, this market resolves to lowest bracket.',
        out
      );
      // Should NOT grab "June 1" from description
      expect(out.tier).toBe('4month2');
      const d = new Date(ts! * 1000);
      expect(d.getUTCMonth()).toBe(3); // April, not June
    });

    it('still matches real weather dates in question', () => {
      const out = { tier: '' };
      extractEndTime('Will it rain in New York on April 15?', '', out);
      expect(out.tier).toBe('4weather');
    });
  });

  // ── Tier 6 — no match ─────────────────────────────────────────────────────
  describe('tier 6 — no match', () => {
    it('returns null for open-ended questions', () => {
      expect(extractEndTime('Will X ever happen?', '')).toBeNull();
    });

    it('returns null for empty inputs', () => {
      expect(extractEndTime('', '')).toBeNull();
    });
  });

  // Date-only tiers should decline when description has explicit timing
  // markers the regex can't extract (noon, hour:min, AM/PM, named tz).
  // Otherwise we stamp EOD and miss the real time-of-day buried in the
  // description (the ETH/USDT $1,800 bug class).
  describe('date-only tier guard (descHasTimingMarker)', () => {
    it('declines on ETH/USDT $1,800-style market (Tier 4e + noon ET description)', () => {
      // Title: "on May 16" matches Tier 4e; description has "noon" + "ET".
      // Old behavior: Tier 4e returns EOD May 16. New: returns null so caller
      // falls through to LLM or Polymarket endDate.
      expect(
        extractEndTime(
          'Will the price of Ethereum be above $1,800 on May 16?',
          'This market resolves at 12:00 in the ET timezone (noon) on the date specified in the title.'
        )
      ).toBeNull();
    });

    it('still returns date-only EOD when description has no timing markers (Tier 4e)', () => {
      // Plain date-only market — description does not name a time of day.
      expect(
        extractEndTime(
          'Will Trump speak on May 18?',
          'Resolves to YES if Trump speaks anywhere on or before May 18.'
        )
      ).toBe(toTs(2026, 5, 18));
    });

    it('declines Tier 4b (with year) when description names noon ET', () => {
      expect(
        extractEndTime(
          'Will SpaceX launch on May 16, 2026?',
          'Final answer is determined at 12:00 ET (noon) on the date in the title.'
        )
      ).toBeNull();
    });

    it('declines Tier 4a ("by Month Day, Year") when description names a time', () => {
      expect(
        extractEndTime(
          'Will the Fed cut rates by April 30, 2026?',
          'Resolves based on the FOMC announcement at 2:00 PM ET on the meeting day.'
        )
      ).toBeNull();
    });

    it('does NOT decline Tier 4c (already extracts time) even if desc has timing markers', () => {
      // Tier 4c parses "May 16 at 12:00 PM ET" directly from the question.
      // We trust it — guard only applies to date-only tiers.
      expect(
        extractEndTime(
          'Will SpaceX launch on May 16 at 12:00 PM ET?',
          'Final answer is determined at noon ET.'
        )
      ).toBe(toTs(2026, 5, 16, 12, 0, -4));
    });

    it('does NOT decline Tier 2a (scheduled + time) even with timing markers in desc', () => {
      // Tier 2a parses explicit time from "scheduled for ... at HH:MM TZ".
      expect(
        extractEndTime(
          'NBA game tonight',
          'Game is scheduled for May 16 at 8:00 PM ET.'
        )
      ).not.toBeNull();
    });
  });

  describe('descHasTimingMarker', () => {
    it('matches "noon"', () => {
      expect(descHasTimingMarker('Resolves at noon on the day.')).toBe(true);
    });
    it('matches "12:00" (HH:MM)', () => {
      expect(descHasTimingMarker('Settles at 12:00 sharp.')).toBe(true);
    });
    it('matches "4 PM" (H AM/PM)', () => {
      expect(descHasTimingMarker('Closes 4 PM.')).toBe(true);
    });
    it('matches "ET" / "Eastern" timezone names', () => {
      expect(descHasTimingMarker('Determined ET.')).toBe(true);
      expect(descHasTimingMarker('Resolves Eastern time.')).toBe(true);
    });
    it('matches "PST", "UTC", "GMT"', () => {
      expect(descHasTimingMarker('Cut-off PST.')).toBe(true);
      expect(descHasTimingMarker('In UTC.')).toBe(true);
      expect(descHasTimingMarker('Per GMT.')).toBe(true);
    });
    it('returns false for plain date-only descriptions', () => {
      expect(
        descHasTimingMarker(
          'Resolves to YES if Trump speaks anywhere on or before May 18.'
        )
      ).toBe(false);
    });
    it('returns false for empty string', () => {
      expect(descHasTimingMarker('')).toBe(false);
    });
    it('does not match "EAST" (not a tz abbreviation, word boundary)', () => {
      expect(descHasTimingMarker('The EAST side of town.')).toBe(false);
    });
  });
});

// Prevent unused import warning
void callOpenRouterForEndTime;
