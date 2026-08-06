import { describe, expect, it } from 'vitest';

import {
  getConditionTimeBucketedVolume,
  getEffectiveVolumeWindow,
} from '../QuestionsTable';

describe('QuestionsTable volume window semantics', () => {
  it('uses filtered window keys when filter volume is enabled', () => {
    expect(getEffectiveVolumeWindow('1h', true)).toBe('1hFiltered');
    expect(getEffectiveVolumeWindow('4h', true)).toBe('4hFiltered');
    expect(getEffectiveVolumeWindow('24h', true)).toBe('24hFiltered');
    expect(getEffectiveVolumeWindow('7d', true)).toBe('7dFiltered');
  });

  it('preserves the base window when filter volume is disabled', () => {
    expect(getEffectiveVolumeWindow('1h', false)).toBe('1h');
    expect(getEffectiveVolumeWindow('24h', false)).toBe('24h');
  });

  it('reads the matching filtered field for child row volume display', () => {
    const condition = {
      similarMarketVolume24h: 125,
      similarMarketVolumeFiltered24h: 75,
    };

    expect(getConditionTimeBucketedVolume(condition as never, '24h')).toBe(125);
    expect(
      getConditionTimeBucketedVolume(condition as never, '24hFiltered')
    ).toBe(75);
  });
});
