import { describe, it, expect } from 'vitest';
import { classifyForExtension } from '../relist/index';

const ONE_DAY = 24 * 60 * 60;

function makeConditions(
  entries: Array<[string, number]>
): Map<string, { endTime: number }> {
  return new Map(entries.map(([id, endTime]) => [id, { endTime }]));
}

describe('classifyForExtension', () => {
  const now = 1_700_000_000; // fixed timestamp
  const graceDays = 2;

  it('marks conditions with future endTime as futureEndTimeSkipped', () => {
    const conditions = makeConditions([
      ['0x1', now + ONE_DAY], // 1 day in the future
      ['0x2', now + 1], // 1 second in the future
    ]);

    const result = classifyForExtension(conditions, now, graceDays);
    expect(result.futureEndTimeSkipped).toBe(2);
    expect(result.gracePeriodSkipped).toBe(0);
    expect(result.eligible).toEqual([]);
  });

  it('marks conditions within grace period as gracePeriodSkipped', () => {
    const conditions = makeConditions([
      ['0x1', now - ONE_DAY], // 1 day ago (within 2-day grace)
      ['0x2', now - 1], // 1 second ago (within grace)
      ['0x3', now - ONE_DAY * 2 + 1], // just under 2 days ago
    ]);

    const result = classifyForExtension(conditions, now, graceDays);
    expect(result.gracePeriodSkipped).toBe(3);
    expect(result.futureEndTimeSkipped).toBe(0);
    expect(result.eligible).toEqual([]);
  });

  it('marks conditions past grace period as eligible', () => {
    const conditions = makeConditions([
      ['0x1', now - ONE_DAY * 2], // exactly 2 days ago
      ['0x2', now - ONE_DAY * 5], // 5 days ago
      ['0x3', now - ONE_DAY * 30], // 30 days ago
    ]);

    const result = classifyForExtension(conditions, now, graceDays);
    expect(result.eligible).toEqual(['0x1', '0x2', '0x3']);
    expect(result.gracePeriodSkipped).toBe(0);
    expect(result.futureEndTimeSkipped).toBe(0);
  });

  it('correctly classifies a mix of all three categories', () => {
    const conditions = makeConditions([
      ['future', now + ONE_DAY * 5], // future
      ['grace', now - ONE_DAY], // within grace
      ['eligible', now - ONE_DAY * 3], // past grace
    ]);

    const result = classifyForExtension(conditions, now, graceDays);
    expect(result.futureEndTimeSkipped).toBe(1);
    expect(result.gracePeriodSkipped).toBe(1);
    expect(result.eligible).toEqual(['eligible']);
  });

  it('returns empty results for empty input', () => {
    const result = classifyForExtension(new Map(), now, graceDays);
    expect(result.eligible).toEqual([]);
    expect(result.gracePeriodSkipped).toBe(0);
    expect(result.futureEndTimeSkipped).toBe(0);
  });

  it('boundary: endTime exactly at now is within grace period', () => {
    const conditions = makeConditions([['0x1', now]]);

    const result = classifyForExtension(conditions, now, graceDays);
    // now - now = 0 < gracePeriodSeconds, so within grace
    expect(result.gracePeriodSkipped).toBe(1);
    expect(result.eligible).toEqual([]);
  });

  it('boundary: endTime exactly at grace period boundary is eligible', () => {
    const conditions = makeConditions([
      ['0x1', now - ONE_DAY * 2], // exactly graceDays ago
    ]);

    const result = classifyForExtension(conditions, now, graceDays);
    // now - endTime = 2 days = gracePeriodSeconds, NOT < gracePeriodSeconds
    expect(result.eligible).toEqual(['0x1']);
  });

  it('works with 0-day grace period (no grace)', () => {
    const conditions = makeConditions([
      ['0x1', now - 1], // 1 second ago
    ]);

    const result = classifyForExtension(conditions, now, 0);
    // 0-day grace means anything in the past is eligible
    expect(result.eligible).toEqual(['0x1']);
    expect(result.gracePeriodSkipped).toBe(0);
  });
});
