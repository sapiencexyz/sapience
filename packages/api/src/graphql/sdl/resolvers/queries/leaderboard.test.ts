import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardMetric } from '../../__generated__/resolvers';

vi.mock('./score', () => ({
  getLeaderboardScores: vi.fn(),
}));

vi.mock('./accountStats', () => ({
  getMerged: vi.fn(),
  rankedFor: vi.fn((entries) => entries),
  resolveWindow: vi.fn(() => ({ fromEpoch: undefined, toEpochResolved: 1000 })),
}));

import { getLeaderboardScores } from './score';
import { getMerged, rankedFor } from './accountStats';
import { leaderboard } from './leaderboard';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult>;

describe('leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ACCURACY rankings from scoring outputs without normalizing value', async () => {
    vi.mocked(getLeaderboardScores).mockResolvedValue([
      { attester: '0xabc', accuracyScore: 0.91 },
      { attester: '0xdef', accuracyScore: 0.5 },
    ]);

    const result = await callResolver<{
      metric: LeaderboardMetric;
      nodes: Array<{
        account: { address: string };
        rank: number;
        value: string;
      }>;
    }>(leaderboard)(
      null,
      { metric: LeaderboardMetric.Accuracy, first: 10 },
      {},
      null
    );

    expect(result.metric).toBe(LeaderboardMetric.Accuracy);
    expect(result.nodes).toEqual([
      {
        account: expect.objectContaining({ address: '0xabc' }),
        rank: 1,
        value: '0.91',
      },
      {
        account: expect.objectContaining({ address: '0xdef' }),
        rank: 2,
        value: '0.5',
      },
    ]);
  });

  it('uses account-stat volume as positive wUSDe value', async () => {
    vi.mocked(getMerged).mockResolvedValue([
      {
        address: '0xaaa',
        netPnL: '10',
        gains: '10',
        losses: '0',
        volume: '25',
      },
    ]);

    const result = await callResolver<{ nodes: Array<{ value: string }> }>(
      leaderboard
    )(null, { metric: LeaderboardMetric.Volume, first: 10 }, {}, null);

    expect(rankedFor).toHaveBeenCalled();
    expect(result.nodes[0].value).toBe('25');
  });

  it('derives ROI as netPnL divided by volume, ranks by ROI, and returns zero for zero volume', async () => {
    vi.mocked(getMerged).mockResolvedValue([
      {
        address: '0xaaa',
        netPnL: '50',
        gains: '50',
        losses: '0',
        volume: '100',
      },
      { address: '0xbbb', netPnL: '9', gains: '9', losses: '0', volume: '10' },
      { address: '0xccc', netPnL: '50', gains: '50', losses: '0', volume: '0' },
    ]);

    const result = await callResolver<{
      nodes: Array<{ account: { address: string }; value: string }>;
    }>(leaderboard)(
      null,
      { metric: LeaderboardMetric.Roi, first: 10 },
      {},
      null
    );

    expect(result.nodes.map((n) => [n.account.address, n.value])).toEqual([
      ['0xbbb', '0.9'],
      ['0xaaa', '0.5'],
      ['0xccc', '0'],
    ]);
  });
});
