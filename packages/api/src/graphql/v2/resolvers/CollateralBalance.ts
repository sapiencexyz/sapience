/**
 * `Account.collateralBalance` and `Account.collateralBalanceHistory`
 * field resolvers. Backed by the v2-local SQL helpers in
 * `./queries/collateralBalance`.
 *
 * The history connection is forward-only with an offset-style cursor —
 * the row set is materialized in-memory by the SQL CTE, so keyset
 * paging would buy nothing over slicing.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import type { AccountResolvers } from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';
import {
  getCollateralBalance,
  getCollateralBalanceHistory,
} from './queries/collateralBalance';

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

// chainId comes from the (chain-scoped) parent account, not a field arg.
const chainIdOf = (parent: unknown): number =>
  (parent as { chainId?: number | null }).chainId ?? DEFAULT_CHAIN_ID;

export const collateralBalanceField: NonNullable<
  AccountResolvers['collateralBalance']
> = async (parent, args) => {
  const row = await getCollateralBalance({
    address: addressOf(parent),
    chainId: chainIdOf(parent),
    atBlock: args.atBlock ?? null,
  });
  // Point-lookup populates `blockNumber`; `timestamp` is the other axis
  // and stays null here.
  return { ...row, timestamp: null } as never;
};

export const collateralBalanceHistoryField: NonNullable<
  AccountResolvers['collateralBalanceHistory']
> = async (parent, args) => {
  const first = clampTake(args.first ?? 12, {
    defaultTake: 12,
    maxTake: 200,
  });
  const after = args.after ? decodeCursor(args.after) : null;
  const offset = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

  // Fetch enough boundaries to cover offset + first + 1 so the slice
  // includes the lookahead row used by `buildConnection` for hasNextPage.
  const totalNeeded = offset + first + 1;
  const rows = await getCollateralBalanceHistory({
    address: addressOf(parent),
    chainId: chainIdOf(parent),
    count: totalNeeded,
    intervalSeconds: args.intervalSeconds ?? null,
  });

  const slice = rows.slice(offset, offset + first + 1).map((row) => ({
    ...row,
    // History buckets populate `timestamp`; `blockNumber` is the other
    // axis and stays null here (no block is pinned per bucket).
    blockNumber: null,
  }));

  return buildConnection({
    rows: slice,
    first,
    totalCount: rows.length,
    getCursor: (_row, idx) =>
      encodeCursor({
        k: String(offset + idx),
        id: slice[idx]?.timestamp.toISOString() ?? '',
      }),
  }) as never;
};
