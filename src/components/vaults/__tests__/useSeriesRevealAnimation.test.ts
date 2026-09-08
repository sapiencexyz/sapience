import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSeriesRevealAnimation } from '~/components/vaults/useSeriesRevealAnimation';

describe('useSeriesRevealAnimation', () => {
  it('animates the first render that actually has points', () => {
    const { result } = renderHook(() => useSeriesRevealAnimation('k', true));
    expect(result.current).toBe(true);
  });

  it('stays armed while the series is still empty', () => {
    const { result, rerender } = renderHook(
      ({ hasData }: { hasData: boolean }) =>
        useSeriesRevealAnimation('k', hasData),
      { initialProps: { hasData: false } }
    );
    expect(result.current).toBe(true);
    rerender({ hasData: false });
    expect(result.current).toBe(true);
    // The reveal is spent on the first painted render, not on the empty ones.
    rerender({ hasData: true });
    expect(result.current).toBe(true);
  });

  it('does not re-animate as later pages extend the same series', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useSeriesRevealAnimation(key, true),
      { initialProps: { key: 'vault-a:ALL' } }
    );
    expect(result.current).toBe(true);
    // Older pages land newest-first; each one must splice in without the
    // whole path tweening to a new shape.
    rerender({ key: 'vault-a:ALL' });
    expect(result.current).toBe(false);
    rerender({ key: 'vault-a:ALL' });
    expect(result.current).toBe(false);
  });

  it('re-arms when the series is replaced rather than extended', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useSeriesRevealAnimation(key, true),
      { initialProps: { key: 'vault-a:ALL' } }
    );
    rerender({ key: 'vault-a:ALL' });
    expect(result.current).toBe(false);

    rerender({ key: 'vault-a:1W' });
    expect(result.current).toBe(true);
    rerender({ key: 'vault-a:1W' });
    expect(result.current).toBe(false);
  });

  it('re-arms when the series empties out and comes back', () => {
    const { result, rerender } = renderHook(
      ({ hasData }: { hasData: boolean }) =>
        useSeriesRevealAnimation('k', hasData),
      { initialProps: { hasData: true } }
    );
    rerender({ hasData: true });
    expect(result.current).toBe(false);

    rerender({ hasData: false });
    rerender({ hasData: true });
    expect(result.current).toBe(true);
  });
});
