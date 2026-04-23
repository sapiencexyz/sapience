import { describe, expect, it } from 'vitest';
import {
  formatPythDurationFromNow,
  formatPythFeedLabel,
  formatPythTargetPriceDisplay,
  parsePythEndDate,
} from '~/lib/auction/pythPredictionDisplay';

describe('formatPythFeedLabel', () => {
  it('strips a single-segment namespace', () => {
    expect(formatPythFeedLabel('Crypto.BTC/USD')).toBe('BTC/USD');
  });

  it('strips only up to the last dot', () => {
    expect(formatPythFeedLabel('Equity.US.AAPL')).toBe('AAPL');
  });

  it('falls back to "Crypto" when undefined', () => {
    expect(formatPythFeedLabel(undefined)).toBe('Crypto');
  });

  it('returns the input verbatim when no dot is present', () => {
    expect(formatPythFeedLabel('RAW')).toBe('RAW');
  });
});

describe('formatPythTargetPriceDisplay', () => {
  it('adds thousand separators to the integer portion', () => {
    expect(formatPythTargetPriceDisplay('12345.67', 12345.67)).toBe(
      '12,345.67'
    );
  });

  it('preserves trailing fractional digits verbatim', () => {
    expect(formatPythTargetPriceDisplay('100.00', 100)).toBe('100.00');
  });

  it('falls back to the numeric value when raw is missing', () => {
    expect(formatPythTargetPriceDisplay(undefined, 42)).toBe('42');
  });

  it('returns empty when neither raw nor a finite number is available', () => {
    expect(formatPythTargetPriceDisplay(undefined, NaN)).toBe('');
  });

  it('returns empty for a whitespace-only raw string and non-finite fallback', () => {
    expect(formatPythTargetPriceDisplay('   ', Number.POSITIVE_INFINITY)).toBe(
      ''
    );
  });
});

describe('parsePythEndDate', () => {
  it('parses a valid YYYY-MM-DDTHH:MM string', () => {
    const d = parsePythEndDate('2099-01-02T03:04');
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d?.getTime())).toBe(true);
  });

  it('returns null for invalid input', () => {
    expect(parsePythEndDate('not-a-date')).toBeNull();
  });
});

describe('formatPythDurationFromNow', () => {
  it('renders sub-minute remaining time as <1M', () => {
    expect(formatPythDurationFromNow(30_000, 0)).toBe('<1M');
  });

  it('floors at the minute boundary', () => {
    const endMs = 59 * 60_000 + 59_000;
    expect(formatPythDurationFromNow(endMs, 0)).toBe('59M');
  });

  it('floors at the hour boundary', () => {
    const endMs = 23 * 3_600_000 + 59 * 60_000;
    expect(formatPythDurationFromNow(endMs, 0)).toBe('23H');
  });

  it('renders days when >= 24 hours', () => {
    const endMs = 48 * 3_600_000;
    expect(formatPythDurationFromNow(endMs, 0)).toBe('2D');
  });

  it('clamps to zero (<1M) when end is in the past', () => {
    expect(formatPythDurationFromNow(-1_000, 0)).toBe('<1M');
  });
});
