/**
 * v2 Account field resolvers. Mirrors v1's Account.ts but:
 *
 *  - `id` encodes via the v2 registry (`toGlobalIdV2`) so opaque ids are
 *    scoped to the v2 endpoint.
 *  - Account-scoped entity feeds (`predictions`, `trades`, `positions`,
 *    `collateralBalance`, `stats`, `ranking`) attach in later phases as
 *    those entity types land. Phase 1 ships the address-keyed identity.
 *  - Referral data lives on the REST surface (`/referrals/*`,
 *    `/admin/referrals/*`); v2 GraphQL does not expose it.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { AccountResolvers } from '../__generated__/resolvers';
import { synthesizeAccount } from './accountSynthesis';
import { accountRank } from './queries/leaderboard';
import { getAccountTotalVolume } from './queries/account';
import {
  collateralBalanceField,
  collateralBalanceHistoryField,
} from './CollateralBalance';

// Account global ids are keyed `(chainId, address)` — an account is a
// wallet view scoped to one chain, so the same address on two chains is
// two distinct nodes. Mirrors the Vault id encoding.
const splitAccountDomainId = (
  id: string
): { chainId: number; address: string } => {
  const sep = id.indexOf(':');
  if (sep <= 0) {
    return { chainId: DEFAULT_CHAIN_ID, address: id.toLowerCase() };
  }
  const chainId = Number(id.slice(0, sep));
  return {
    chainId: Number.isInteger(chainId) ? chainId : DEFAULT_CHAIN_ID,
    address: id.slice(sep + 1).toLowerCase(),
  };
};

registerNodeTypeV2({
  type: 'Account',
  loader: async (id, ctx) => {
    const { chainId, address } = splitAccountDomainId(id);
    const loaders = (
      ctx as {
        loaders?: { userByAddress?: { load: (a: string) => Promise<unknown> } };
      }
    )?.loaders;
    const row = loaders?.userByAddress
      ? await loaders.userByAddress.load(address)
      : await prisma.user.findUnique({ where: { address } });
    const base = (row ?? synthesizeAccount(address)) as Record<string, unknown>;
    return { ...base, chainId };
  },
});

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

// Parent is the Prisma User row (chain-agnostic); chainId is attached at
// the resolution boundary (query/loader), so read it off defensively.
const chainIdOf = (parent: unknown): number =>
  (parent as { chainId?: number | null }).chainId ?? DEFAULT_CHAIN_ID;

export const Account: AccountResolvers = {
  id: (parent) =>
    toGlobalIdV2('Account', `${chainIdOf(parent)}:${addressOf(parent)}`),

  chainId: (parent) => chainIdOf(parent),

  /**
   * Account ranking on the chosen metric. Delegates to the leaderboard
   * resolver to share materialization. The shared helper returns a
   * synthesized Ranking row; cast at the boundary because the generated
   * resolver type wraps the parent in a strict ResolverTypeWrapper.
   */
  ranking: accountRank as AccountResolvers['ranking'],

  collateralBalance: collateralBalanceField,
  collateralBalanceHistory: collateralBalanceHistoryField,

  /**
   * Aggregate statistics. `totalVolume` is the v1 `accountTotalVolume`
   * port (G6): one indexed aggregate over `position` + `Prediction`,
   * present for every address — including synthesized accounts with no
   * User row, which carry only `{ address }`.
   */
  stats: async (parent) => ({
    totalVolume: await getAccountTotalVolume(addressOf(parent)),
  }),

  // DEFERRED — the rest of the account stats surface beyond
  // `stats.totalVolume` (which ships, G6): PnL/accuracy fields on
  // AccountStat and a `statsHistory` bucketed series — the account's
  // return-on-deployed PnL (same numerator a vault plots on-total). No
  // per-account time-series source exists yet — accountStats.ts is a
  // windowed leaderboard aggregate, not a bucketed series — so statsHistory
  // needs a new per-account snapshot writer/table. No consumer today. See
  // the matching note on the `Account` type in schema.graphql.
};
