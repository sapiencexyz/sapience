import type { User as PrismaUserRow } from '../../../../generated/prisma';

/**
 * Build a non-null Account shape for address-backed GraphQL fields when no
 * profile row exists. The synthetic record carries `id: 0` as a sentinel for
 * "no User row" — fields that would need a persisted row to resolve should
 * short-circuit on that.
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
