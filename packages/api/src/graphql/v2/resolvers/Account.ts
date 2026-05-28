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

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import { synthesizeAccount } from './accountSynthesis';
import type { AccountResolvers } from '../__generated__/resolvers';
import { accountRank } from './queries/leaderboard';
import {
  collateralBalanceField,
  collateralBalanceHistoryField,
} from './CollateralBalance';

registerNodeTypeV2({
  type: 'Account',
  loader: async (id, ctx) => {
    const address = id.toLowerCase();
    const loaders = (
      ctx as {
        loaders?: { userByAddress?: { load: (a: string) => Promise<unknown> } };
      }
    )?.loaders;
    const row = loaders?.userByAddress
      ? await loaders.userByAddress.load(address)
      : await prisma.user.findUnique({ where: { address } });
    return row ?? synthesizeAccount(address);
  },
});

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

export const Account: AccountResolvers = {
  id: (parent) => toGlobalIdV2('Account', addressOf(parent)),

  /**
   * Account ranking on the chosen metric. Delegates to the leaderboard
   * resolver to share materialization. The shared helper returns a
   * synthesized Ranking row; cast at the boundary because the generated
   * resolver type wraps the parent in a strict ResolverTypeWrapper.
   */
  ranking: accountRank as AccountResolvers['ranking'],

  collateralBalance: collateralBalanceField,
  collateralBalanceHistory: collateralBalanceHistoryField,
};
