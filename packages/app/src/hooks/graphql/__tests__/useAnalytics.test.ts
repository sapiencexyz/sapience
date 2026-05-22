import { describe, it, expect } from 'vitest';
import { getProtocolTvlWei } from '../useAnalytics';

describe('getProtocolTvlWei', () => {
  it('returns 0n when both inputs are null/undefined', () => {
    expect(getProtocolTvlWei(null, null)).toBe(0n);
    expect(getProtocolTvlWei(undefined, undefined)).toBe(0n);
  });

  it('sums escrowBalance and availableAssets', () => {
    expect(
      getProtocolTvlWei({ escrowBalance: '100' }, { availableAssets: '250' })
    ).toBe(350n);
  });

  it('treats missing fields as zero', () => {
    expect(
      getProtocolTvlWei({ escrowBalance: '' }, { availableAssets: '42' })
    ).toBe(42n);
    expect(
      getProtocolTvlWei({ escrowBalance: '42' }, { availableAssets: '' })
    ).toBe(42n);
  });

  it('handles large wei values', () => {
    const oneEther = 10n ** 18n;
    expect(
      getProtocolTvlWei(
        { escrowBalance: oneEther.toString() },
        { availableAssets: oneEther.toString() }
      )
    ).toBe(2n * oneEther);
  });
});
