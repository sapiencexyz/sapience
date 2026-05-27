import type { User as PrismaUserRow } from '../../../../generated/prisma';

/**
 * Build a non-null Account shape for address-backed GraphQL fields when no
 * profile row exists. The synthetic record deliberately carries no referral
 * identity; Account field resolvers treat `id === 0` as "no User row" and
 * short-circuit anything that would require one (`referrals` returns empty,
 * `referredBy*` already null out via the missing fk).
 */
export const synthesizeAccount = (address: string): PrismaUserRow =>
  ({
    id: 0,
    address: address.toLowerCase(),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    refCodeHash: null,
    maxReferrals: 0,
    referredById: null,
    referredByCodeId: null,
  }) as PrismaUserRow;
