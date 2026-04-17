import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import type { Commitment, Quote } from '@sapience/sdk/types/committedIntent';
import { rankQuotes, simulateWalk } from '../ranker';
import type { SignedQuoteEntry } from '../state';

const PREDICTOR = '0x0000000000000000000000000000000000000001' as Address;
const COMMIT_HASH = ('0x' + '11'.repeat(32)) as Hex;

function makeCommitment(over: Partial<Commitment> = {}): Commitment {
  return {
    predictor: PREDICTOR,
    predictorWindowEnd: 0n,
    deadline: 9_999_999_999n,
    pickConfigId: ('0x' + '22'.repeat(32)) as Hex,
    amountIn: 100n,
    minFillIn: 60n,
    minAmountOut: 150n,
    executorTip: 0n,
    nonce: 0n,
    ...over,
  };
}

function makeQuote(partial: Partial<Quote> & Pick<Quote, 'maxIn' | 'amountOut'>): SignedQuoteEntry {
  const q: Quote = {
    counterparty: ('0x' + '0'.repeat(39) + '2') as Address,
    deadline: 9_999_999_999n,
    commitmentHash: COMMIT_HASH,
    maxIn: partial.maxIn,
    amountOut: partial.amountOut,
    nonce: 0n,
    ...partial,
  };
  return { quote: q, signature: '0xdead' as Hex, receivedAt: 0 };
}

describe('rankQuotes', () => {
  it('orders quotes by implicit price descending (matches pickBestPriceFirst)', () => {
    const entries = [
      makeQuote({ maxIn: 100n, amountOut: 200n }), // price 2.00
      makeQuote({ maxIn: 60n, amountOut: 130n }), // price 2.17
      makeQuote({ maxIn: 80n, amountOut: 160n }), // price 2.00
    ];
    const ranked = rankQuotes(entries);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].quote.maxIn).toBe(60n);
    expect(ranked[0].quote.amountOut).toBe(130n);
  });

  it('drops quotes whose deadline has already passed', () => {
    const now = 1_000_000n;
    const live = makeQuote({ maxIn: 10n, amountOut: 20n });
    const expired = makeQuote({ maxIn: 10n, amountOut: 30n, deadline: 500n });
    const ranked = rankQuotes([live, expired], now);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].quote.maxIn).toBe(10n);
    expect(ranked[0].quote.amountOut).toBe(20n);
  });
});

describe('simulateWalk', () => {
  it('fills completely when a single quote covers amountIn (PRD 6.1)', () => {
    const c = makeCommitment();
    const ranked = rankQuotes([
      makeQuote({ maxIn: 100n, amountOut: 200n }),
    ]);
    const walk = simulateWalk(c, ranked);
    expect(walk.filledIn).toBe(100n);
    expect(walk.aggregateOut).toBe(200n);
    expect(walk.feasibleSliceCount).toBe(1);
    expect(walk.monotonicityOk).toBe(true);
  });

  it('aggregates across two quotes (PRD 6.2)', () => {
    const c = makeCommitment();
    const ranked = rankQuotes([
      makeQuote({ maxIn: 60n, amountOut: 130n }), // 2.17
      makeQuote({ maxIn: 80n, amountOut: 160n }), // 2.00
    ]);
    const walk = simulateWalk(c, ranked);
    expect(walk.filledIn).toBe(100n);
    // 130 + (40 * 160 / 80) = 130 + 80 = 210
    expect(walk.aggregateOut).toBe(210n);
    expect(walk.feasibleSliceCount).toBe(2);
    expect(walk.sliceIns).toEqual([60n, 40n]);
    expect(walk.sliceOuts).toEqual([130n, 80n]);
  });

  it('partial-fills when quotes exhaust before amountIn (PRD 6.3)', () => {
    const c = makeCommitment({ minFillIn: 60n });
    const ranked = rankQuotes([
      makeQuote({ maxIn: 70n, amountOut: 160n }),
    ]);
    const walk = simulateWalk(c, ranked);
    expect(walk.filledIn).toBe(70n);
    expect(walk.aggregateOut).toBe(160n);
    expect(walk.feasibleSliceCount).toBe(1);
  });

  it('reports below-minFillIn walks honestly (caller decides)', () => {
    const c = makeCommitment({ minFillIn: 80n });
    const ranked = rankQuotes([
      makeQuote({ maxIn: 50n, amountOut: 120n }),
    ]);
    const walk = simulateWalk(c, ranked);
    expect(walk.filledIn).toBe(50n);
    expect(walk.filledIn < c.minFillIn).toBe(true);
  });

  it('flags monotonicity violations via the cross-multiply check', () => {
    const c = makeCommitment();
    // Deliberately out-of-order — feed as-is to simulateWalk.
    const ranked = [
      makeQuote({ maxIn: 80n, amountOut: 160n }), // 2.00
      makeQuote({ maxIn: 60n, amountOut: 130n }), // 2.17 (better, violates)
    ].map((e) => ({
      quote: e.quote,
      signature: e.signature,
      quoteHash: ('0x' + '0'.repeat(64)) as Hex,
      receivedAt: 0,
    }));
    const walk = simulateWalk(c, ranked);
    expect(walk.monotonicityOk).toBe(false);
  });
});
