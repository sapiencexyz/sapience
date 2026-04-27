import { describe, expect, it } from 'vitest';
import { selectBestBid } from '~/lib/auction/selectBestBid';
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

const NOW = 1_000_000;

function bid(overrides: Partial<QuoteBid>): QuoteBid {
  const defaults: QuoteBid = {
    counterparty: '0x1111111111111111111111111111111111111111',
    counterpartyCollateral: '1000',
    counterpartyDeadline: Math.floor(NOW / 1000) + 60,
    validationStatus: 'valid',
  } as unknown as QuoteBid;
  return { ...defaults, ...overrides } as QuoteBid;
}

describe('selectBestBid', () => {
  it('returns nulls for an empty bid list', () => {
    expect(selectBestBid([], NOW)).toEqual({
      bestBid: null,
      estimateBid: null,
    });
  });

  it('picks the bid with the highest counterpartyCollateral', () => {
    const a = bid({ counterpartyCollateral: '500', counterparty: '0xaaa' });
    const b = bid({ counterpartyCollateral: '1500', counterparty: '0xbbb' });
    const c = bid({ counterpartyCollateral: '1000', counterparty: '0xccc' });
    const result = selectBestBid([a, b, c], NOW);
    expect(result.bestBid).toBe(b);
    expect(result.estimateBid).toBeNull();
  });

  it('ignores bids whose deadline has passed', () => {
    const expired = bid({
      counterpartyDeadline: Math.floor(NOW / 1000) - 10,
      counterpartyCollateral: '9999',
      counterparty: '0xexpired',
    });
    const fresh = bid({
      counterpartyCollateral: '500',
      counterparty: '0xfresh',
    });
    const result = selectBestBid([expired, fresh], NOW);
    expect(result.bestBid).toBe(fresh);
  });

  it('returns all-null when every regular bid is expired and no estimator is available', () => {
    const expired = bid({
      counterpartyDeadline: Math.floor(NOW / 1000) - 10,
    });
    expect(selectBestBid([expired], NOW)).toEqual({
      bestBid: null,
      estimateBid: null,
    });
  });

  it('surfaces the estimator quoter as an estimate when no valid regular bid exists', () => {
    const estimator = bid({
      counterparty: PREFERRED_ESTIMATE_QUOTER,
      counterpartyDeadline: 1, // sentinel used by estimator bids
      counterpartyCollateral: '42',
      validationStatus: 'valid',
    });
    const result = selectBestBid([estimator], NOW);
    expect(result.bestBid).toBeNull();
    expect(result.estimateBid).toBe(estimator);
  });

  it('prefers a live valid regular bid over the estimator', () => {
    const estimator = bid({
      counterparty: PREFERRED_ESTIMATE_QUOTER,
      counterpartyDeadline: 1,
      counterpartyCollateral: '9999',
      validationStatus: 'valid',
    });
    const regular = bid({
      counterpartyCollateral: '100',
      counterparty: '0xregular',
    });
    const result = selectBestBid([estimator, regular], NOW);
    expect(result.bestBid).toBe(regular);
    expect(result.estimateBid).toBeNull();
  });

  it('shows a single failed bid as an estimate when there are no valid bids', () => {
    const failed = bid({
      validationStatus: 'invalid',
      counterparty: '0xfailed',
    });
    const result = selectBestBid([failed], NOW);
    expect(result.bestBid).toBeNull();
    expect(result.estimateBid).toBe(failed);
  });

  it('does not show multiple failed bids as an estimate', () => {
    const f1 = bid({
      validationStatus: 'invalid',
      counterparty: '0xfailed1',
    });
    const f2 = bid({
      validationStatus: 'invalid',
      counterparty: '0xfailed2',
    });
    const result = selectBestBid([f1, f2], NOW);
    expect(result.bestBid).toBeNull();
    expect(result.estimateBid).toBeNull();
  });
});
