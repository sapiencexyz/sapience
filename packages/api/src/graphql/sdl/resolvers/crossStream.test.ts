import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  pick: { findMany: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

vi.mock('./queries/escrow', () => ({
  predictionsConnection: vi.fn((_parent, args) => ({ args })),
  positionsConnection: vi.fn((_parent, args) => ({ args })),
}));

vi.mock('./queries/trade', () => ({
  tradesConnection: vi.fn((_parent, args) => ({ args })),
}));

vi.mock('./queries/crud', () => ({
  forecastsConnection: vi.fn((_parent, args) => ({ args })),
}));

import { predictionsConnection, positionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';
import { forecastsConnection } from './queries/crud';
import { Condition } from './Condition';
import { Question } from './Question';
import { PickConfiguration } from './PickConfiguration';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => TResult;

describe('cross-stream child connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.pick.findMany.mockResolvedValue([
      {
        pickConfiguration: {
          predictorToken: '0xTokenA',
          counterpartyToken: '0xTokenB',
        },
      },
      {
        pickConfiguration: {
          predictorToken: '0xTokenC',
          counterpartyToken: null,
        },
      },
    ]);
  });

  it('Condition child connections force conditionId parent scope', async () => {
    callResolver(Condition.predictionsConnection)(
      { id: 'cond1' },
      { filter: { chainId: 1 } },
      {},
      null
    );
    await callResolver(Condition.trades)(
      { id: 'cond1' },
      { filter: { chainId: 1 } },
      {},
      null
    );
    callResolver(Condition.forecasts)(
      { id: 'cond1' },
      { filter: {} },
      {},
      null
    );

    expect(predictionsConnection).toHaveBeenCalledWith(
      { id: 'cond1' },
      { filter: { chainId: 1, conditionId: 'cond1' } },
      {},
      null
    );
    expect(tradesConnection).toHaveBeenCalledWith(
      { id: 'cond1' },
      { filter: { chainId: 1, tokens: ['0xtokena', '0xtokenb', '0xtokenc'] } },
      {},
      null
    );
    expect(forecastsConnection).toHaveBeenCalledWith(
      { id: 'cond1' },
      { filter: { conditionId: 'cond1' } },
      {},
      null
    );
  });

  it('Question condition child connections force condition/token parent scope', async () => {
    const parent = {
      questionType: 'condition',
      condition: { id: 'cond1' },
      group: null,
    };

    callResolver(Question.predictions)(parent, { filter: {} }, {}, null);
    await callResolver(Question.trades)(
      parent,
      { filter: { chainId: 1 } },
      {},
      null
    );
    callResolver(Question.forecasts)(parent, { filter: {} }, {}, null);

    expect(predictionsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { conditionId: 'cond1' } },
      {},
      null
    );
    expect(tradesConnection).toHaveBeenCalledWith(
      parent,
      { filter: { chainId: 1, tokens: ['0xtokena', '0xtokenb', '0xtokenc'] } },
      {},
      null
    );
    expect(forecastsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { conditionId: 'cond1' } },
      {},
      null
    );
  });

  it('Question group child connections use all group conditions instead of empty streams', async () => {
    const parent = {
      questionType: 'group',
      condition: null,
      group: { id: 1, conditions: [{ id: 'cond1' }, { id: 'cond2' }] },
    };

    callResolver(Question.predictions)(parent, { filter: {} }, {}, null);
    await callResolver(Question.trades)(parent, { filter: {} }, {}, null);
    callResolver(Question.forecasts)(parent, { filter: {} }, {}, null);

    expect(predictionsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { conditionIds: ['cond1', 'cond2'] } },
      {},
      null
    );
    expect(mockPrisma.pick.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { conditionId: { in: ['cond1', 'cond2'] } },
      })
    );
    expect(tradesConnection).toHaveBeenCalledWith(
      parent,
      { filter: { tokens: ['0xtokena', '0xtokenb', '0xtokenc'] } },
      {},
      null
    );
    expect(forecastsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { conditionIds: ['cond1', 'cond2'] } },
      {},
      null
    );
  });

  it('PickConfiguration child connections force pickConfig/token parent scope', () => {
    const parent = {
      id: 'PC1',
      predictorToken: '0xTokenA',
      counterpartyToken: '0xTokenB',
    };

    callResolver(PickConfiguration.predictions)(
      parent,
      { filter: {} },
      {},
      null
    );
    callResolver(PickConfiguration.positions)(parent, { filter: {} }, {}, null);
    callResolver(PickConfiguration.trades)(
      parent,
      { filter: { chainId: 1 } },
      {},
      null
    );

    expect(predictionsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { pickConfigId: 'pc1' } },
      {},
      null
    );
    expect(positionsConnection).toHaveBeenCalledWith(
      parent,
      { filter: { pickConfigId: 'pc1' } },
      {},
      null
    );
    expect(tradesConnection).toHaveBeenCalledWith(
      parent,
      { filter: { chainId: 1, tokens: ['0xtokena', '0xtokenb'] } },
      {},
      null
    );
  });
});
