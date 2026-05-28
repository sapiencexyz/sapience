import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  picks: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  pick: { findMany: vi.fn() },
  condition: { findUnique: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { PickConfiguration, Pick } from './PickConfiguration';
import {
  pickConfiguration,
  pickConfigurations,
} from './queries/pickConfiguration';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const PICK_CONFIG_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000456';

describe('PickConfiguration (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.picks.findMany.mockResolvedValue([]);
    mockPrisma.picks.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 PickConfiguration:<pickConfigId>', async () => {
    const id = await callResolver<string>(PickConfiguration.id)(
      { id: PICK_CONFIG_ID },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'PickConfiguration',
      id: PICK_CONFIG_ID,
    });
  });

  it('marketAddress is canonicalized to lowercase', () => {
    expect(
      callResolver<string>(PickConfiguration.marketAddress)(
        { marketAddress: '0xABCDEF0000000000000000000000000000000000' },
        {},
        {},
        null
      )
    ).toBe('0xabcdef0000000000000000000000000000000000');
  });

  it('Pick maps Prisma `conditionResolver` to v2 `resolver`', () => {
    expect(
      callResolver<string>(Pick.resolver)(
        { conditionResolver: '0xRESOLVER000000000000000000000000000000000' },
        {},
        {},
        null
      )
    ).toBe('0xresolver000000000000000000000000000000000');
  });

  it('pickConfiguration(pickConfigId:) lowercases the lookup', async () => {
    await callResolver(pickConfiguration)(
      null,
      { pickConfigId: PICK_CONFIG_ID.toUpperCase() },
      {},
      null
    );
    expect(mockPrisma.picks.findUnique).toHaveBeenCalledWith({
      where: { id: PICK_CONFIG_ID },
      include: { picks: true },
    });
  });

  it('pickConfigurations(filter: { tokens }) ORs across predictor/counterparty token', async () => {
    await callResolver(pickConfigurations)(
      null,
      { first: 50, filter: { tokens: ['0xA', '0xB'] } },
      {},
      null
    );
    expect(mockPrisma.picks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { predictorToken: { in: ['0xa', '0xb'] } },
            { counterpartyToken: { in: ['0xa', '0xb'] } },
          ],
        }),
      })
    );
  });
});
