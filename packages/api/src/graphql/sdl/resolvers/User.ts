/**
 * User model resolvers. Three relations:
 *  - `referrals` (list, self-reference via `UserReferrals` relation) —
 *    legacy slow path; the SDL still exposes filter args so it's not
 *    safely batchable.
 *  - `referredBy` (single, self-reference inverse) — FK on parent
 *    (`referredById`). DataLoader: `userById`.
 *  - `referredByCode` (single, to ReferralCode) — FK on parent
 *    (`referredByCodeId`). DataLoader: `referralCodeById`.
 */

import type { UserResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaUser = {
  id: number;
  referredById?: number | null;
  referredByCodeId?: number | null;
  referredBy?: unknown;
  referredByCode?: unknown;
  [k: string]: unknown;
};

export const User: UserResolvers = {
  referrals: async (parent, args) =>
    loadRelation(parent as PrismaUser, 'referrals', {
      parentModel: 'user',
      parentWhere: { id: (parent as PrismaUser).id },
      prismaRelationName: 'referrals',
      args,
    }),

  referredBy: async (parent, args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredBy !== undefined) return p.referredBy as never;
    if (p.referredById == null) return null;
    if (ctx.loaders) return ctx.loaders.userById.load(p.referredById);
    return loadRelation(p, 'referredBy', {
      parentModel: 'user',
      parentWhere: { id: p.id },
      prismaRelationName: 'referredBy',
      args,
    });
  },

  referredByCode: async (parent, args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredByCode !== undefined) return p.referredByCode as never;
    if (p.referredByCodeId == null) return null;
    if (ctx.loaders)
      return ctx.loaders.referralCodeById.load(p.referredByCodeId);
    return loadRelation(p, 'referredByCode', {
      parentModel: 'user',
      parentWhere: { id: p.id },
      prismaRelationName: 'referredByCode',
      args,
    });
  },
};
