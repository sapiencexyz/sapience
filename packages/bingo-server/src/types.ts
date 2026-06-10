import type { Address, Hex } from 'viem';

export interface PoolCondition {
  conditionId: Hex; // bytes32
  resolver: Address;
  question?: string;
  shortName?: string;
  imageUrl?: string;
  /** Unix seconds; informational (the pool cutoff is the enforced gate). */
  endTime?: number;
}

export interface PoolConfig {
  poolId: string;
  /** Unix seconds. Submissions are refused at/after this time. Must be
   *  before the earliest condition can start resolving. */
  cutoff: number;
  /** >= 16 entries, unique by (conditionId, resolver). */
  conditions: PoolCondition[];
  /** Bonus multiplier in bps by winning-line count; length 11 (0..10 wins). */
  multiplierBps: number[];
  /** Referrer cut of card price, in bps. */
  referralBps: number;
  /** Floor card price in wei (18-dec USDe). */
  minCardPriceWei: string;
}

export type LineStatus =
  | 'pending'
  | 'quoting'
  | 'signing'
  | 'submitting'
  | 'done'
  | 'failed';

export interface LineProgress {
  lineId: string;
  status: LineStatus;
  error?: string;
  opHash?: string;
}

/** Mirrors the shape the bingo frontend serializes (sessionKeyManager.ts). */
export interface SerializedSession {
  config: {
    durationHours: number;
    expiresAt: number;
    ownerAddress: Address;
    smartAccountAddress: Address;
  };
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address;
  createdAt: number;
  etherealApproval: string;
  chainId: number;
}

/** A pool plus its fairness secret, journaled when the admin creates it.
 *  Old pools stay resolvable so historical cards keep their layouts. */
export interface PoolRecord {
  pool: PoolConfig;
  /** 0x 32-byte hex; commitment published at /pool, revealed after cutoff. */
  secret: Hex;
  createdAt: number;
}

export interface CardSubmission {
  player: Address;
  poolId: string;
  /** Bit i set = YES on cell i (cells in dealt order). */
  yesMask: number;
  cardPriceWei: string;
  /** Referrer payout address, if any. */
  ref: Address | null;
  submittedAt: number;
}

export interface EntitlementRow {
  player: Address;
  poolId: string;
  cardPriceWei: string;
  linesFunded: number;
  complete: boolean;
  wins: number | null;
  /** True once no funded line's outcome can change. */
  decided: boolean | null;
  /** True while a complete card's owed amounts can still grow (not every
   *  line decided). Pay only when this is false. Null until complete. */
  provisional: boolean | null;
  bonusOwedWei: string | null;
  ref: Address | null;
  referralOwedWei: string | null;
  /** Receipt NFT state, when the contract is configured. The treasury pays
   *  through payBonus/payReferral(tokenId, …) on the receipt contract. */
  receiptTokenId: string | null;
  bonusPaidOnChain: boolean | null;
  referralPaidOnChain: boolean | null;
}
