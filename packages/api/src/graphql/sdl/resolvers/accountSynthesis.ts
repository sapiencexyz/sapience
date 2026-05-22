import type { Account } from '../__generated__/resolvers';

/**
 * Build a non-null Account shape for address-backed GraphQL fields when no
 * profile row exists. The synthetic record deliberately carries no referral
 * identity; Account field resolvers treat the missing integer id as no refs.
 */
export const synthesizeAccount = (address: string): Account =>
  ({
    id: 0,
    address: address.toLowerCase(),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    refCodeHash: null,
    maxReferrals: 0,
    referredById: null,
    referredByCodeId: null,
    referredBy: null,
    referredByCode: null,
    referrals: [],
  }) as unknown as Account;
