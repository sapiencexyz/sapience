import { describe, it, expect } from 'vitest';
import { filterByResolver } from '../settlement/resolver-filter';

const CT_RESOLVER = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const PYTH_RESOLVER = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb';

describe('filterByResolver', () => {
  it('keeps conditions matching the target resolver', () => {
    const conditions = [
      { id: '0x01', resolver: CT_RESOLVER },
      { id: '0x02', resolver: CT_RESOLVER },
    ];
    const result = filterByResolver(conditions, CT_RESOLVER);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['0x01', '0x02']);
  });

  it('filters out conditions with a different resolver', () => {
    const conditions = [
      { id: '0x01', resolver: CT_RESOLVER },
      { id: '0x02', resolver: PYTH_RESOLVER },
      { id: '0x03', resolver: CT_RESOLVER },
    ];
    const result = filterByResolver(conditions, CT_RESOLVER);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['0x01', '0x03']);
  });

  it('filters out conditions with null resolver', () => {
    const conditions = [
      { id: '0x01', resolver: CT_RESOLVER },
      { id: '0x02', resolver: null },
    ];
    const result = filterByResolver(conditions, CT_RESOLVER);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('0x01');
  });

  it('matches case-insensitively', () => {
    const conditions = [
      { id: '0x01', resolver: CT_RESOLVER.toLowerCase() },
      { id: '0x02', resolver: CT_RESOLVER.toUpperCase() },
    ];
    const result = filterByResolver(conditions, CT_RESOLVER);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no conditions match', () => {
    const conditions = [
      { id: '0x01', resolver: PYTH_RESOLVER },
      { id: '0x02', resolver: PYTH_RESOLVER },
    ];
    const result = filterByResolver(conditions, CT_RESOLVER);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const result = filterByResolver([], CT_RESOLVER);
    expect(result).toHaveLength(0);
  });
});
