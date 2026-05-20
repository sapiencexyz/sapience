import { describe, expect, it, vi } from 'vitest';

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
import { PickConfiguration } from './PickConfiguration';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => TResult;

describe('PR6 cross-stream child connections', () => {
  it('Condition child connections force conditionId parent scope', () => {
    callResolver(Condition.predictions)({ id: 'cond1' }, { filter: { chainId: 1 } }, {}, null);
    callResolver(Condition.forecasts)({ id: 'cond1' }, { filter: {} }, {}, null);

    expect(predictionsConnection).toHaveBeenCalledWith(
      { id: 'cond1' },
      { filter: { chainId: 1, conditionId: 'cond1' } },
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

  it('PickConfiguration child connections force pickConfig/token parent scope', () => {
    const parent = {
      id: 'PC1',
      predictorToken: '0xTokenA',
      counterpartyToken: '0xTokenB',
    };

    callResolver(PickConfiguration.predictions)(parent, { filter: {} }, {}, null);
    callResolver(PickConfiguration.positions)(parent, { filter: {} }, {}, null);
    callResolver(PickConfiguration.trades)(parent, { filter: { chainId: 1 } }, {}, null);

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
