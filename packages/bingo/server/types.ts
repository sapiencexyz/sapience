import type { Address, Hex } from 'viem';

export interface PoolCondition {
  conditionId: Hex; // bytes32
  resolver: Address;
  question?: string;
  shortName?: string;
  imageUrl?: string;
  /** Estimated YES probability (0–1) for the market, if known. Surfaced as
   *  the cell's odds badge on the frontend. */
  estimatedPrice?: number;
  /** Unix seconds; informational (the pool cutoff is the enforced gate). */
  endTime?: number;
}

export interface PoolConfig {
  poolId: string;
  /** Display name for the pool, shown as the card header title. Falls back
   *  to the default ("World Cup 2026") on the frontend when absent. */
  title?: string;
  /** Unix seconds. Submissions are refused at/after this time. Must be
   *  before the earliest condition can start resolving. */
  cutoff: number;
  /** Unix seconds; optional. Before this the pool is not yet open (and not
   *  the active pool), letting future pools be committed ahead of time —
   *  each becomes active when its opensAt passes. Absent = open from the
   *  start. Must be before cutoff. */
  opensAt?: number;
  /** >= 16 entries, unique by (conditionId, resolver). */
  conditions: PoolCondition[];
  /** Bonus multiplier in bps by winning-line count; length 11 (0..10 wins). */
  multiplierBps: number[];
  /** Referrer cut of card price, in bps. */
  referralBps: number;
  /** Floor card price in wei (18-dec USDe). */
  minCardPriceWei: string;
}

/** Mirrors the shape the bingo frontend serializes (sessionKeyManager.ts).
 *  Never stored — the client sends it with each request that acts as the
 *  player, and it lives only for that request. */
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

export interface EntitlementRow {
  player: Address;
  poolId: string;
  /** Which of the player's cards in this pool (0-based). */
  cardIndex: number;
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
  /** Receipt NFT state. The treasury pays through payBonus/payReferral
   *  (tokenId, …) on the receipt contract. */
  receiptTokenId: string | null;
  bonusPaidOnChain: boolean | null;
  referralPaidOnChain: boolean | null;
}
