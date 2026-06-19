import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  prediction: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { activity } from './activity';

type ActivityFn = (
  parent: unknown,
  args: Record<string, unknown>,
  ctx: unknown,
  info: unknown
) => Promise<{
  edges: unknown[];
  totalCount: unknown;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
}>;

const activityFn = activity as unknown as ActivityFn;

const ALICE = '0xalice000000000000000000000000000000000001';
const TOKEN_PRED = '0xpred000000000000000000000000000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.prediction.findMany.mockResolvedValue([]);
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  mockPrisma.prediction.count.mockResolvedValue(0);
  mockPrisma.secondaryTrade.count.mockResolvedValue(0);
});

describe('activity query token filtering', () => {
  it('scopes account activity to the exact position token side', async () => {
    await activityFn(
      null,
      {
        first: 20,
        filter: {
          account: ALICE.toUpperCase(),
          token: TOKEN_PRED.toUpperCase(),
        },
      },
      null,
      null
    );

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  predictor: ALICE,
                  pickConfiguration: { predictorToken: TOKEN_PRED },
                },
                {
                  counterparty: ALICE,
                  pickConfiguration: { counterpartyToken: TOKEN_PRED },
                },
              ],
            },
          ],
        },
      })
    );

    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ buyer: ALICE }, { seller: ALICE }] },
            { token: TOKEN_PRED },
          ],
        },
      })
    );
  });
});
