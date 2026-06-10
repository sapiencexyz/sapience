/**
 * User model resolvers. Three relations:
 *  - `referrals` (list, self-reference via `UserReferrals` relation)
 *  - `referredBy` (single, self-reference inverse)
 *  - `referredByCode` (single, to ReferralCode)
 */

import type { UserResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaUser = { id: number; [k: string]: unknown };

export const User: UserResolvers = {
  referrals: async (parent, args) =>
    loadRelation(parent as PrismaUser, 'referrals', {
      parentModel: 'user',
      parentWhere: { id: (parent as PrismaUser).id },
      prismaRelationName: 'referrals',
      args,
    }),

  referredBy: async (parent, args) =>
    loadRelation(parent as PrismaUser, 'referredBy', {
      parentModel: 'user',
      parentWhere: { id: (parent as PrismaUser).id },
      prismaRelationName: 'referredBy',
      args,
    }),

  referredByCode: async (parent, args) =>
    loadRelation(parent as PrismaUser, 'referredByCode', {
      parentModel: 'user',
      parentWhere: { id: (parent as PrismaUser).id },
      prismaRelationName: 'referredByCode',
      args,
    }),
};
