/**
 * ReferralCode model resolvers. One relation: `claimedBy`
 * (list, to User, via the AdminCodeClaims relation).
 */

import type { ReferralCodeResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaReferralCode = { id: number; [k: string]: unknown };

export const ReferralCode: ReferralCodeResolvers = {
  claimedBy: async (parent, args) =>
    loadRelation(parent as PrismaReferralCode, 'claimedBy', {
      parentModel: 'referralCode',
      parentWhere: { id: (parent as PrismaReferralCode).id },
      prismaRelationName: 'claimedBy',
      args,
    }),
};
