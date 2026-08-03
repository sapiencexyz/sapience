import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from '~/lib/format/relativeTime';

describe('relativeTime', () => {
  const NOW = new Date('2026-05-03T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [NOW - 5_000, '5s ago'],
    [NOW - 59_000, '59s ago'],
    [NOW - 60_000, '1m ago'],
    [NOW - 5 * 60_000, '5m ago'],
    [NOW - 60 * 60_000, '1h ago'],
    [NOW - 26 * 60 * 60_000, '26h ago'],
  ])('past timestamp %s → %s', (ts, expected) => {
    expect(relativeTime(ts)).toBe(expected);
  });

  it('clamps future timestamps to 0s', () => {
    expect(relativeTime(NOW + 10_000)).toBe('0s ago');
  });
});
