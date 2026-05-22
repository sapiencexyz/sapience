import { describe, expect, it } from 'vitest';
import { fromGlobalId, registeredNodeTypes } from '../../relay/globalId';
import { Position } from './Position';

describe('Position Node identity', () => {
  it('encodes id as an opaque Node id and exposes positionId separately', async () => {
    expect(registeredNodeTypes()).toEqual(expect.arrayContaining(['Position']));

    const parent = { id: '123-sell-0xtrade' };
    const id = await (Position.id as (parent: unknown) => string)(parent);
    const positionId = await (
      Position.positionId as (parent: unknown) => string
    )(parent);

    expect(fromGlobalId(id)).toEqual({
      type: 'Position',
      id: '123-sell-0xtrade',
    });
    expect(positionId).toBe('123-sell-0xtrade');
  });
});
