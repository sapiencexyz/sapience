/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `Account.collateralBalance` and `Account.collateralBalanceHistory`
 * field resolvers. Delegate to v1's `collateralBalance` /
 * `collateralBalanceHistory` query resolvers and reshape into v2's
 * narrower wire types.
 */

import {
  collateralBalance as v1Balance,
  collateralBalanceHistory as v1History,
} from '../../sdl/resolvers/queries/collateralBalance';
import { encodeCursor, decodeCursor } from '../../relay/cursor';
import { clampTake } from '../../sdl/resolvers/queries/pagination';

const addressOf = (parent: any): string =>
  (parent?.address ?? '').toLowerCase();

export const collateralBalanceField = async (
  parent: unknown,
  args: { chainId: number; atBlock?: bigint | number | null }
) => {
  const raw = await (v1Balance as any)(null, {
    account: addressOf(parent),
    chainId: args.chainId,
    atBlock: args.atBlock != null ? Number(args.atBlock) : null,
  });
  return {
    address: raw.address,
    chainId: raw.chainId,
    amount: raw.amount,
    atBlock: raw.atBlock ?? null,
  };
};

export const collateralBalanceHistoryField = async (
  parent: unknown,
  args: {
    chainId: number;
    first?: number | null;
    after?: string | null;
    intervalSeconds?: number | null;
  }
) => {
  // Number of boundaries requested. v1's `count` is the *additional*
  // snapshots beyond "now"; v2's `first` is the page size. Translate by
  // requesting `first` boundaries.
  const first = clampTake(args.first ?? 12, {
    defaultTake: 12,
    maxTake: 200,
  });
  const after = args.after ? decodeCursor(args.after) : null;
  const offset = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

  // Fetch enough boundaries to cover offset + first + 1 for hasNextPage.
  const totalNeeded = offset + first + 1;
  const rows: Array<{
    address: string;
    chainId: number;
    amount: string;
    blockNumber: bigint | number | string;
    timestamp: Date;
  }> = await (v1History as any)(null, {
    account: addressOf(parent),
    chainId: args.chainId,
    count: totalNeeded,
    intervalSeconds: args.intervalSeconds ?? null,
  });

  const slice = rows.slice(offset, offset + first);
  const hasNextPage = rows.length > offset + first;
  const edges = slice.map((row, idx) => ({
    node: row,
    cursor: encodeCursor({
      k: String(offset + idx),
      id: String(row.blockNumber),
    }),
  }));

  return {
    edges,
    nodes: slice,
    totalCount: rows.length,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: offset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
