import { describe, it, expect } from 'vitest';
import { composeProtocolTvlSeries, getProtocolTvlWei } from '../useAnalytics';

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

describe('composeProtocolTvlSeries', () => {
  it('sums protocol escrow and matching vault available assets by timestamp', () => {
    expect(
      composeProtocolTvlSeries(
        [
          {
            timestamp: 100,
            openInterest: '3000000000000000000',
            escrowBalance: '1000000000000000000',
          },
        ],
        [{ timestamp: 100, availableAssets: '2000000000000000000' }]
      )
    ).toEqual([
      {
        timestamp: 100,
        openInterest: 3,
        protocolTvl: 3,
        vaultAvailableAssets: 2,
      },
    ]);
  });

  it('does not invent vault assets for missing timestamps', () => {
    expect(
      composeProtocolTvlSeries(
        [
          {
            timestamp: 100,
            openInterest: '0',
            escrowBalance: '1000000000000000000',
          },
        ],
        [{ timestamp: 200, availableAssets: '9000000000000000000' }]
      )[0].protocolTvl
    ).toBe(1);
  });
});
