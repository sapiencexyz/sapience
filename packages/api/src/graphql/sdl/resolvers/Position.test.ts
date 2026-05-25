import { describe, expect, it } from 'vitest';
import { registeredNodeTypes } from '../../relay/globalId';
import { Position } from './Position';

describe('Position identity', () => {
  it('Position is no longer a Node type — positionId still surfaces the natural row id', async () => {
    expect(registeredNodeTypes()).not.toContain('Position');

    const parent = { id: '123-sell-0xtrade' };
    const positionId = await (
      Position.positionId as (parent: unknown) => string
    )(parent);

    expect(positionId).toBe('123-sell-0xtrade');
  });
});
