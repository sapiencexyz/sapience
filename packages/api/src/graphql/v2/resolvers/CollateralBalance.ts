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
import type { AccountResolvers } from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';

type V1ResolverFn = (parent: null, args: unknown, ctx: unknown) => unknown;

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

type V1BalanceResult = {
  address: string;
  chainId: number;
  amount: string;
  atBlock?: number | null;
};

type V1HistoryRow = {
  address: string;
  chainId: number;
  amount: string;
  blockNumber: bigint | number | string;
  timestamp: Date;
};

export const collateralBalanceField: NonNullable<
  AccountResolvers['collateralBalance']
> = async (parent, args) => {
  const raw = (await (v1Balance as unknown as V1ResolverFn)(
    null,
    {
      account: addressOf(parent),
      chainId: args.chainId,
      atBlock: args.atBlock != null ? Number(args.atBlock) : null,
    },
    null
  )) as V1BalanceResult;
  return {
    address: raw.address,
    chainId: raw.chainId,
    amount: BigInt(raw.amount),
    atBlock: raw.atBlock ?? null,
  };
};

export const collateralBalanceHistoryField: NonNullable<
  AccountResolvers['collateralBalanceHistory']
> = async (parent, args) => {
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
  const rows = (await (v1History as unknown as V1ResolverFn)(
    null,
    {
      account: addressOf(parent),
      chainId: args.chainId,
      count: totalNeeded,
      intervalSeconds: args.intervalSeconds ?? null,
    },
    null
  )) as V1HistoryRow[];

  const slice = rows.slice(offset, offset + first + 1).map((row) => ({
    address: row.address,
    chainId: row.chainId,
    amount: BigInt(row.amount),
    blockNumber: BigInt(row.blockNumber),
    timestamp: row.timestamp,
  }));

  return buildConnection({
    rows: slice,
    first,
    totalCount: rows.length,
    getCursor: (_row, idx) =>
      encodeCursor({
        k: String(offset + idx),
        id: String(slice[idx]?.blockNumber ?? ''),
      }),
  });
};
