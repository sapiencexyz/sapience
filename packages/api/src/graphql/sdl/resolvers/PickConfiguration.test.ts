import { describe, expect, it } from 'vitest';
import { fromGlobalId, registeredNodeTypes } from '../../relay/globalId';
import { PickConfiguration } from './PickConfiguration';

describe('PickConfiguration Node identity', () => {
  it('encodes id as an opaque Node id and exposes pickConfigId separately', async () => {
    expect(registeredNodeTypes()).toEqual(
      expect.arrayContaining(['PickConfiguration'])
    );

    const parent = { id: 'pick-config-1' };
    const id = await (PickConfiguration.id as (parent: unknown) => string)(
      parent
    );
    const pickConfigId = await (
      PickConfiguration.pickConfigId as (parent: unknown) => string
    )(parent);

    expect(fromGlobalId(id)).toEqual({
      type: 'PickConfiguration',
      id: 'pick-config-1',
    });
    expect(pickConfigId).toBe('pick-config-1');
  });
});
