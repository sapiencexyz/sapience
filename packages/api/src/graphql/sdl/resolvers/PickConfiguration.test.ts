import { describe, expect, it } from 'vitest';
import { registeredNodeTypes } from '../../relay/globalId';
import { PickConfiguration } from './PickConfiguration';

describe('PickConfiguration identity', () => {
  it('PickConfiguration is no longer a Node type — pickConfigId still surfaces the natural id', async () => {
    expect(registeredNodeTypes()).not.toContain('PickConfiguration');

    const parent = { id: 'pick-config-1' };
    const pickConfigId = await (
      PickConfiguration.pickConfigId as (parent: unknown) => string
    )(parent);

    expect(pickConfigId).toBe('pick-config-1');
  });
});
