/**
 * Account field resolvers. `Account` is the public-API-shaped projection
 * of the same Prisma `User` row — see codegen-resolvers.ts mapper.
 *
 * Three relations:
 *   - `referredBy` (Account, FK on parent's `referredById`) — DataLoader: `userById`
 *   - `referredByCode` (ReferralCode, FK on parent's `referredByCodeId`) — DataLoader: `referralCodeById`
 *   - `referrals` (list, self-reference via `UserReferrals` relation) — direct prisma query
 */

import type { AccountResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PrismaUser = {
  id: number;
  referredById?: number | null;
  referredByCodeId?: number | null;
};

export const Account: AccountResolvers = {
  referredBy: async (parent, _args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredById == null) return null;
    return ctx.loaders!.userById.load(p.referredById);
  },

  referredByCode: async (parent, _args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredByCodeId == null) return null;
    return ctx.loaders!.referralCodeById.load(p.referredByCodeId);
  },

  referrals: async (parent) => {
    const p = parent as PrismaUser;
    if (p.id == null) return [];
    return prisma.user.findMany({ where: { referredById: p.id } });
  },
};
