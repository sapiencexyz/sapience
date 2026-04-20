import { describe, it, expect } from 'vitest';
import { getProtocolTvlWei } from '../useAnalytics';

describe('getProtocolTvlWei', () => {
  it('returns 0n for null/undefined', () => {
    expect(getProtocolTvlWei(null)).toBe(0n);
    expect(getProtocolTvlWei(undefined)).toBe(0n);
  });

  it('sums escrowBalance and vaultAvailableAssets', () => {
    expect(
      getProtocolTvlWei({
        escrowBalance: '100',
        vaultAvailableAssets: '250',
      })
    ).toBe(350n);
  });

  it('treats missing fields as zero', () => {
    expect(
      getProtocolTvlWei({
        escrowBalance: '',
        vaultAvailableAssets: '42',
      })
    ).toBe(42n);
    expect(
      getProtocolTvlWei({
        escrowBalance: '42',
        vaultAvailableAssets: '',
      })
    ).toBe(42n);
  });

  it('handles large wei values', () => {
    const oneEther = 10n ** 18n;
    expect(
      getProtocolTvlWei({
        escrowBalance: oneEther.toString(),
        vaultAvailableAssets: oneEther.toString(),
      })
    ).toBe(2n * oneEther);
  });
});
