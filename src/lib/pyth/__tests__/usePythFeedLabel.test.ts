import { describe, it, expect } from 'vitest';
import { getPythFeedLabelSync } from '../usePythFeedLabel';

describe('getPythFeedLabelSync', () => {
  it('returns ticker for known SDK feed "2" (ETH)', () => {
    expect(getPythFeedLabelSync('2')).toBe('ETH');
  });

  it('returns ticker for known SDK feed "1" (BTC)', () => {
    expect(getPythFeedLabelSync('1')).toBe('BTC');
  });

  it('returns ticker for known feed as bytes32', () => {
    // Feed ID 2 as bytes32 hex
    const bytes32 =
      '0x0000000000000000000000000000000000000000000000000000000000000002';
    expect(getPythFeedLabelSync(bytes32)).toBe('ETH');
  });

  it('returns null for unknown feed ID', () => {
    expect(getPythFeedLabelSync('999999')).toBeNull();
  });

  it('returns null for invalid priceId', () => {
    expect(getPythFeedLabelSync('not-a-number')).toBeNull();
  });

  it('returns null for Hermes-style bytes32 with high bits set', () => {
    const hermesId =
      '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    expect(getPythFeedLabelSync(hermesId)).toBeNull();
  });

  it('returns ticker for feed as short hex', () => {
    // Feed ID 1 as hex
    expect(getPythFeedLabelSync('0x1')).toBe('BTC');
  });

  it('returns ticker for feed 85 (ENA)', () => {
    expect(getPythFeedLabelSync('85')).toBe('ENA');
  });
});
