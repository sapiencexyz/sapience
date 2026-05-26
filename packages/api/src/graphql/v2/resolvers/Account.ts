/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 Account field resolvers. Mirrors v1's Account.ts but:
 *
 *  - `id` encodes via the v2 registry (`toGlobalIdV2`) so opaque ids are
 *    scoped to the v2 endpoint.
 *  - Account-scoped entity feeds (`predictions`, `trades`, `forecasts`,
 *    `positions`, `collateralBalance`, `stats`, `rank`) attach in later
 *    phases as those entity types land. Phase 1 ships the address-keyed
 *    identity + the referral graph only.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import { synthesizeAccount } from '../../sdl/resolvers/accountSynthesis';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  withCursorWhere,
} from '../relay/connection';
import { accountRank } from './queries/leaderboard';
import {
  collateralBalanceField,
  collateralBalanceHistoryField,
} from './CollateralBalance';

registerNodeTypeV2({
  type: 'Account',
  loader: async (id, ctx: any) => {
    const address = id.toLowerCase();
    const row = ctx?.loaders?.userByAddress
      ? await ctx.loaders.userByAddress.load(address)
      : await prisma.user.findUnique({ where: { address } });
    return row ?? synthesizeAccount(address);
  },
});

const addressOf = (parent: any): string =>
  (parent?.address ?? '').toLowerCase();

const emptyAccountConnection = () =>
  buildConnection<never, never>({
    rows: [],
    first: 0,
    totalCount: 0,
    getCursor: () => '',
  });

export const Account = {
  id: (parent: any) => toGlobalIdV2('Account', addressOf(parent)),

  referredBy: async (parent: any, _args: unknown, ctx: any) => {
    if (parent.referredById == null) return null;
    return ctx.loaders!.userById.load(parent.referredById);
  },

  referredByCode: async (parent: any, _args: unknown, ctx: any) => {
    if (parent.referredByCodeId == null) return null;
    return ctx.loaders!.referralCodeById.load(parent.referredByCodeId);
  },

  /**
   * Cursor-paginated list of accounts referred by `parent`. Synthesized
   * accounts have `id: 0` (no User row), so they yield an empty
   * connection without a query.
   *
   * Cursor key is `(createdAt, id)` to stay stable under concurrent
   * inserts; direction is DESC (newest referrals first).
   */
  rank: accountRank,

  collateralBalance: collateralBalanceField,
  collateralBalanceHistory: collateralBalanceHistoryField,

  referrals: async (parent: any, args: any) => {
    if (!parent.id) return emptyAccountConnection();

    const first = clampTake(args.first ?? 50, {
      defaultTake: 50,
      maxTake: 100,
    });
    const cursor = args.after ? decodeCursor(args.after) : null;
    const baseWhere = { referredById: parent.id };
    const cursorWhere = cursor
      ? buildKeysetWhere<typeof baseWhere>({
          orderField: 'createdAt',
          orderValue: new Date(cursor.k),
          idField: 'id',
          idValue: Number(cursor.id),
          direction: 'desc',
        })
      : null;

    const [rows, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: withCursorWhere(baseWhere, cursorWhere),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: first + 1,
      }),
      prisma.user.count({ where: baseWhere }),
    ]);

    return buildConnection({
      rows,
      first,
      totalCount,
      getCursor: (row) =>
        encodeCursor({
          k: row.createdAt.toISOString(),
          id: String(row.id),
        }),
    });
  },
};

/**
 * ReferralCode does not implement Node — it's a small value-typed
 * record fetched only through `Account.referredByCode`. The resolver
 * map below maps the v1 Prisma row to v2's narrower shape: `createdBy`
 * is canonicalized to a lowercase Address, and the leaked internal
 * `id` / `updatedAt` fields are dropped.
 */
export const ReferralCode = {
  createdBy: (parent: any): string => (parent.createdBy ?? '').toLowerCase(),
};
