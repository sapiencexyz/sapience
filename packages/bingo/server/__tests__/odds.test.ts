import { describe, expect, it } from 'vitest';
import { liveDealableCount, withLiveOdds, type LiveOdds } from '../odds.js';
import type { PoolCondition } from '../types.js';

const RESOLVER = '0xc7a489f8b5cef914fca2511a84cdc0221cd9a0f4' as const;

function cond(idByte: number, estimatedPrice?: number): PoolCondition {
  return {
    conditionId: `0x${idByte.toString(16).padStart(2, '0').repeat(32)}`,
    resolver: RESOLVER,
    ...(estimatedPrice !== undefined ? { estimatedPrice } : {}),
  };
}

function odds(
  entries: [PoolCondition, LiveOdds][],
): Map<string, LiveOdds> {
  return new Map(
    entries.map(([c, o]) => [c.conditionId.toLowerCase(), o]),
  );
}

describe('withLiveOdds', () => {
  it('overrides the snapshot price with the live price', () => {
    const c = cond(1, 0.5);
    const out = withLiveOdds([c], odds([[c, { estimatedPrice: 0.02, settled: false }]]));
    expect(out[0].estimatedPrice).toBe(0.02);
  });

  it('keeps the snapshot price when the API has no live price', () => {
    const c = cond(1, 0.5);
    const out = withLiveOdds([c], odds([[c, { estimatedPrice: null, settled: false }]]));
    expect(out[0].estimatedPrice).toBe(0.5);
  });

  it('leaves a condition untouched when no live entry exists', () => {
    const c = cond(1, 0.5);
    expect(withLiveOdds([c], new Map())[0].estimatedPrice).toBe(0.5);
  });
});

describe('liveDealableCount', () => {
  it('counts only currently-uncertain, unsettled markets', () => {
    const a = cond(1, 0.5); // live 0.45 → dealable
    const b = cond(2, 0.5); // live 0.97 → not dealable
    const c = cond(3, 0.5); // settled → not dealable
    const d = cond(4, 0.5); // no live entry → falls back to snapshot 0.5 → dealable
    const map = odds([
      [a, { estimatedPrice: 0.45, settled: false }],
      [b, { estimatedPrice: 0.97, settled: false }],
      [c, { estimatedPrice: 0.5, settled: true }],
    ]);
    expect(liveDealableCount([a, b, c, d], map)).toBe(2);
  });

  it('a market that was uncertain at snapshot but has since resolved is dropped', () => {
    // Snapshot says 0.5 (would pass the static filter) but it has settled.
    const c = cond(1, 0.5);
    expect(
      liveDealableCount([c], odds([[c, { estimatedPrice: 0.99, settled: true }]])),
    ).toBe(0);
  });
});
