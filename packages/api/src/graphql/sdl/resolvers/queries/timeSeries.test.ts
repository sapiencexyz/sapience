import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryAccountVolume: vi.fn(),
  queryAccountPnl: vi.fn(),
  queryAccountBalance: vi.fn(),
  queryAccountPredictionCount: vi.fn(),
}));

vi.mock('../../../../services/timeSeriesQueries', () => mocks);

import type {
  QueryAccountVolumeArgs,
  QueryAccountPnlArgs,
  QueryAccountBalanceArgs,
  QueryAccountPredictionCountArgs,
} from '../../__generated__/resolvers';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
} from './timeSeries';

type ResolverFn<Args> = (
  parent: unknown,
  args: Args,
  ctx: unknown,
  info: unknown
) => Promise<unknown>;

const accountVolumeFn =
  accountVolume as unknown as ResolverFn<QueryAccountVolumeArgs>;
const accountPnlFn = accountPnl as unknown as ResolverFn<QueryAccountPnlArgs>;
const accountBalanceFn =
  accountBalance as unknown as ResolverFn<QueryAccountBalanceArgs>;
const accountPredictionCountFn =
  accountPredictionCount as unknown as ResolverFn<QueryAccountPredictionCountArgs>;

const ALICE = '0xalice';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryAccountVolume.mockResolvedValue([]);
  mocks.queryAccountPnl.mockResolvedValue([]);
  mocks.queryAccountBalance.mockResolvedValue([]);
  mocks.queryAccountPredictionCount.mockResolvedValue([]);
});

// Each of the four resolvers is a thin pass-through to a helper. Testing
// the same shape on each is what catches regressions if someone adds an
// argument to one wrapper and forgets to forward it.
describe.each([
  {
    name: 'accountVolume',
    fn: accountVolumeFn,
    helper: mocks.queryAccountVolume,
  },
  { name: 'accountPnl', fn: accountPnlFn, helper: mocks.queryAccountPnl },
  {
    name: 'accountBalance',
    fn: accountBalanceFn,
    helper: mocks.queryAccountBalance,
  },
  {
    name: 'accountPredictionCount',
    fn: accountPredictionCountFn,
    helper: mocks.queryAccountPredictionCount,
  },
])('$name resolver', ({ fn, helper }) => {
  it('forwards address as-is (helper is responsible for normalization)', async () => {
    await fn(
      undefined,
      { address: ALICE, interval: 'DAY' as never },
      undefined,
      undefined
    );
    expect(helper).toHaveBeenCalledWith(ALICE, 'DAY', undefined, undefined);
  });

  it('passes interval through unchanged (HOUR/DAY/WEEK/MONTH)', async () => {
    for (const interval of ['HOUR', 'DAY', 'WEEK', 'MONTH'] as const) {
      helper.mockClear();
      await fn(
        undefined,
        { address: ALICE, interval: interval as never },
        undefined,
        undefined
      );
      expect(helper).toHaveBeenCalledWith(
        ALICE,
        interval,
        undefined,
        undefined
      );
    }
  });

  it('passes through Date instances unchanged', async () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await fn(
      undefined,
      { address: ALICE, interval: 'DAY' as never, from, to },
      undefined,
      undefined
    );
    expect(helper).toHaveBeenCalledWith(ALICE, 'DAY', from, to);
  });

  it('coerces ISO string from/to into Date', async () => {
    await fn(
      undefined,
      {
        address: ALICE,
        interval: 'DAY' as never,
        from: '2026-01-01T00:00:00Z' as unknown as Date,
        to: '2026-02-01T00:00:00Z' as unknown as Date,
      },
      undefined,
      undefined
    );
    const [, , forwardedFrom, forwardedTo] = helper.mock.calls[0];
    expect(forwardedFrom).toBeInstanceOf(Date);
    expect(forwardedTo).toBeInstanceOf(Date);
    expect((forwardedFrom as Date).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect((forwardedTo as Date).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z'
    );
  });

  it('passes undefined when from/to are null (no implicit "now" upper bound)', async () => {
    await fn(
      undefined,
      {
        address: ALICE,
        interval: 'DAY' as never,
        from: null,
        to: null,
      },
      undefined,
      undefined
    );
    expect(helper).toHaveBeenCalledWith(ALICE, 'DAY', undefined, undefined);
  });

  it('returns the helper result verbatim', async () => {
    const fixture = [{ time: 1, value: '1' }];
    helper.mockResolvedValue(fixture);
    const result = await fn(
      undefined,
      { address: ALICE, interval: 'DAY' as never },
      undefined,
      undefined
    );
    expect(result).toBe(fixture);
  });
});
