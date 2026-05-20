import { describe, it, expect } from 'vitest';
import { isTemplatedMarket } from '../generate/templated';
import type { PolymarketMarket } from '../types';

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: '1',
    question: 'q',
    conditionId: '0x' + 'a'.repeat(64),
    outcomes: ['Yes', 'No'],
    volume: '0',
    liquidity: '0',
    endDate: '2026-01-01T00:00:00Z',
    description: '',
    slug: 'slug',
    active: true,
    closed: false,
    ...overrides,
  };
}

describe('isTemplatedMarket', () => {
  it('returns true when sportsMarketType is set (e.g. moneyline)', () => {
    expect(
      isTemplatedMarket(makeMarket({ sportsMarketType: 'moneyline' }))
    ).toBe(true);
  });

  it('returns true when first event has seriesSlug', () => {
    expect(
      isTemplatedMarket(
        makeMarket({ events: [{ seriesSlug: 'ethereum-daily-prices' }] })
      )
    ).toBe(true);
  });

  it('returns true when first event has a non-empty series array', () => {
    expect(
      isTemplatedMarket(
        makeMarket({ events: [{ series: [{ slug: 'btc-candle' }] }] })
      )
    ).toBe(true);
  });

  it('returns true when marketGroup AND groupItemTitle are both set', () => {
    expect(
      isTemplatedMarket(
        makeMarket({
          marketGroup: 'crypto-price-thresholds',
          groupItemTitle: '↑ $1,800',
        })
      )
    ).toBe(true);
  });

  it('returns false for bare groupItemTitle without marketGroup', () => {
    expect(isTemplatedMarket(makeMarket({ groupItemTitle: '↑ $1,800' }))).toBe(
      false
    );
  });

  it('returns false for bare marketGroup without groupItemTitle', () => {
    expect(isTemplatedMarket(makeMarket({ marketGroup: 'foo' }))).toBe(false);
  });

  it('returns false for empty events array', () => {
    expect(isTemplatedMarket(makeMarket({ events: [] }))).toBe(false);
  });

  it('returns false when first event has no template-indicating fields', () => {
    expect(
      isTemplatedMarket(makeMarket({ events: [{ title: 'Some event' }] }))
    ).toBe(false);
  });

  it('returns false for an empty series array on the first event', () => {
    expect(isTemplatedMarket(makeMarket({ events: [{ series: [] }] }))).toBe(
      false
    );
  });

  it('returns false for a plain one-off market with no template signals', () => {
    expect(isTemplatedMarket(makeMarket())).toBe(false);
  });
});
