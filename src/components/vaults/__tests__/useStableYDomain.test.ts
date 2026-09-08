import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useStableYDomain,
  type YDomain,
} from '~/components/vaults/useStableYDomain';

describe('useStableYDomain', () => {
  it('passes the first domain through unchanged', () => {
    const { result } = renderHook(() => useStableYDomain([0, 10], 'k'));
    expect(result.current).toEqual([0, 10]);
  });

  it('holds steady when a later page falls inside the current domain', () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: YDomain }) => useStableYDomain(d, 'k'),
      { initialProps: { d: [0, 10] as YDomain } }
    );
    // An older page arrives whose values sit well inside the existing range —
    // recomputing would rescale the axis and jump every existing point.
    rerender({ d: [2, 8] as YDomain });
    expect(result.current).toEqual([0, 10]);
  });

  it('expands when an older page brings a genuinely new extreme', () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: YDomain }) => useStableYDomain(d, 'k'),
      { initialProps: { d: [0, 10] as YDomain } }
    );
    rerender({ d: [-5, 12] as YDomain });
    expect(result.current).toEqual([-5, 12]);
  });

  it('converges on the union across a streaming walk', () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: YDomain }) => useStableYDomain(d, 'k'),
      { initialProps: { d: [0, 10] as YDomain } }
    );
    for (const d of [
      [1, 9],
      [-2, 10],
      [-2, 14],
      [0, 13],
    ] as YDomain[]) {
      rerender({ d });
    }
    expect(result.current).toEqual([-2, 14]);
  });

  it('resets when the series is replaced rather than extended', () => {
    const { result, rerender } = renderHook(
      ({ d, k }: { d: YDomain; k: string }) => useStableYDomain(d, k),
      { initialProps: { d: [0, 100] as YDomain, k: '7d' } }
    );
    expect(result.current).toEqual([0, 100]);
    // Switching period swaps the series out; the old extremes must not stick.
    rerender({ d: [0, 5] as YDomain, k: '1d' });
    expect(result.current).toEqual([0, 5]);
  });
});
