/**
 * `account(address:)` / `accounts(...)` — singular + Relay connection
 * over the User table. Synthesis lives at the single-lookup level only;
 * the plural connection returns persisted rows.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { synthesizeAccount } from '../accountSynthesis';
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  encodeCursor,
  normalizeDirection,
  timestampCursorArgs,
} from '../../relay/connection';

type AccountCtx = {
  loaders?: { userByAddress?: { load: (a: string) => Promise<unknown> } };
};

type ResolvedAccount = NonNullable<
  Awaited<ReturnType<typeof prisma.user.findUnique>>
>;

/**
 * Resolve a chain-scoped account view for an address: load the persisted
 * User row (via the request loader when available) or synthesize one, then
 * attach the resolved `chainId`. Shared by the `account(address:)` query
 * and `Vault.account` so both produce the identical Account parent shape.
 * `chainId` defaults to the deployment's chain when the caller omits it.
 */
export const loadAccount = async (
  address: string,
  chainId: number | null | undefined,
  ctx: AccountCtx | null | undefined
): Promise<ResolvedAccount> => {
  const addressLc = address.toLowerCase();
  const row = ctx?.loaders?.userByAddress
    ? await ctx.loaders.userByAddress.load(addressLc)
    : await prisma.user.findUnique({ where: { address: addressLc } });
  // synthesizeAccount returns a v1-typed Account; the runtime shape matches
  // the Prisma row mapper, so the cast is purely a name-level fix. The
  // synthesis path guarantees a value, never null.
  return {
    ...((row ?? synthesizeAccount(addressLc)) as ResolvedAccount),
    chainId: chainId ?? DEFAULT_CHAIN_ID,
  } as ResolvedAccount;
};

export const account: NonNullable<QueryResolvers['account']> = (
  _parent,
  { address, chainId },
  ctx
) => loadAccount(address, chainId, ctx);

interface VolumeRow {
  total: string;
}

/**
 * Lifetime trading volume in wei for an address, backing
 * `Account.stats.totalVolume` (G6). The SQL is v1's `accountTotalVolume`
 * (sdl/resolvers/queries/volume.ts) ported verbatim: volume is summed
 * across legacy `position` rows and the newer `Prediction` table, and
 * either side of a position (predictor or counterparty) contributes its
 * collateral when the address matches. Works for any address — no User
 * row required.
 */
export const getAccountTotalVolume = async (
  address: string
): Promise<bigint> => {
  const addr = address.toLowerCase();
  // Addresses are stored lowercase by indexers, so no LOWER() needed.
  const [result] = await prisma.$queryRaw<VolumeRow[]>`
    SELECT COALESCE(SUM(vol), 0)::TEXT as total
    FROM (
      SELECT
        CASE WHEN predictor = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE 0 END
        +
        CASE WHEN counterparty = ${addr}
             THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE 0 END
        AS vol
      FROM position
      WHERE predictor = ${addr} OR counterparty = ${addr}
      UNION ALL
      SELECT
        CASE WHEN predictor = ${addr}
             THEN CAST("predictorCollateral" AS DECIMAL)
             ELSE 0 END
        +
        CASE WHEN counterparty = ${addr}
             THEN CAST("counterpartyCollateral" AS DECIMAL)
             ELSE 0 END
        AS vol
      FROM "Prediction"
      WHERE predictor = ${addr} OR counterparty = ${addr}
    ) combined
  `;
  return BigInt(result?.total ?? '0');
};

export const accounts: NonNullable<QueryResolvers['accounts']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');
  const search = args.filter?.search?.trim();
  // User rows are chain-agnostic; chainId only scopes the returned
  // account view, so it's attached to each node rather than filtered in SQL.
  const chainId = args.filter?.chainId ?? DEFAULT_CHAIN_ID;

  const where: Prisma.UserWhereInput = search
    ? { address: { contains: search.toLowerCase(), mode: 'insensitive' } }
    : {};

  // createdAt is Timestamp(6); a JS-Date keyset loses microseconds and would
  // duplicate same-millisecond rows. Page via Prisma's native id cursor, which
  // resolves order server-side at full precision.
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: first + 1,
    ...timestampCursorArgs(args.after, Number),
  });
  const scopedRows = rows.map((row) => ({ ...row, chainId }));

  return buildConnection({
    rows: scopedRows,
    first,
    totalCount: () => prisma.user.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k: row.createdAt.toISOString(),
        id: String(row.id),
      }),
  });
};
