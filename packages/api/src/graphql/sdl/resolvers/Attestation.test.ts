import { describe, it, expect, vi, beforeEach } from 'vitest';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));
vi.mock('./relationHelpers', () => helperMock);

import { Attestation } from './Attestation';

type RelationFn = (
  parent: unknown,
  args?: unknown,
  ctx?: unknown
) => Promise<unknown>;

const callField = (
  field: 'condition' | 'attestationScore',
  parent: unknown,
  args: unknown,
  ctx: unknown
) => {
  const fn = (Attestation as unknown as Record<string, RelationFn>)[field];
  return fn(parent, args, ctx);
};

beforeEach(() => {
  helperMock.loadRelation.mockReset();
});

describe('Attestation.condition', () => {
  it('routes through ctx.loaders.conditionById when no where arg is supplied', async () => {
    const load = vi.fn().mockResolvedValue({ id: '0xcond' });
    const result = await callField(
      'condition',
      { id: 1, conditionId: '0xcond' },
      undefined,
      { loaders: { conditionById: { load } } }
    );
    expect(load).toHaveBeenCalledWith('0xcond');
    expect(result).toEqual({ id: '0xcond' });
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('returns null without calling the loader when conditionId is null', async () => {
    const load = vi.fn();
    const result = await callField(
      'condition',
      { id: 1, conditionId: null },
      undefined,
      { loaders: { conditionById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('falls back to loadRelation when a where arg is present (preserves filter semantics)', async () => {
    helperMock.loadRelation.mockResolvedValue(null);
    const load = vi.fn();
    await callField(
      'condition',
      { id: 1, conditionId: '0xcond' },
      { where: { settled: true } },
      { loaders: { conditionById: { load } } }
    );
    expect(load).not.toHaveBeenCalled();
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
  });

  it('returns the pre-loaded relation without invoking the loader', async () => {
    const preloaded = { id: '0xcond', settled: true };
    const result = await callField(
      'condition',
      { id: 1, conditionId: '0xcond', condition: preloaded },
      undefined,
      { loaders: { conditionById: { load: vi.fn() } } }
    );
    expect(result).toBe(preloaded);
  });
});
