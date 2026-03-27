import type { Address, Hex } from 'viem';

/**
 * Prediction Market Types
 * TypeScript equivalents of the Solidity types in the PredictionMarketEscrow contract
 */

/**
 * Outcome side for a pick.
 *
 * NO = 0, YES = 1. This mirrors the Solidity enum (IV2Types.OutcomeSide)
 * where values are assigned by declaration order. The ordering is
 * load-bearing: it is ABI-encoded as uint8, hashed into pickConfigId,
 * and embedded in EIP-712 signatures.
 *
 * V1 contracts used the inverted order (YES = 0, NO = 1). Use
 * {@link isV1EscrowContract} and {@link normalizeOutcomeSide} when
 * reading data from legacy contracts.
 *
 * This is an enum rather than a boolean because resolution can be
 * non-decisive (tie) — the OutcomeVector [1,1] represents a result
 * where neither YES nor NO wins outright. Using an enum keeps the
 * prediction side extensible without conflating it with resolution.
 */
export enum OutcomeSide {
  NO = 0,
  YES = 1,
}

/**
 * V1 escrow contracts that used the inverted OutcomeSide ordering
 * (YES = 0, NO = 1). The database stores raw on-chain values, so
 * reads from these contracts must be flipped before semantic use.
 */
const V1_ESCROW_CONTRACTS: ReadonlySet<string> = new Set(
  [
    // Ethereal mainnet
    '0x8aA92a92436e89cF72E5525A54B64D317919d624',
    '0xEF6B5C544814a3c5E335b6D2BAec6CBDe0f97A76',
    '0x243022eBf5d66741499d76555CADFDE51e101e03',
    '0xC18ed3483733d4e15516c2Fe101fF20B61e88A55',
    '0x23C765fcE26aDbA3A1e0790d548410367D5A3487',
    // Ethereal testnet
    '0x9afaAAda6dc3a5013ef6fbaab203A55102E329eb',
    '0x3B680e06B9A384179644C1bC7842Db67Df5Fb5f0',
    '0x3025C4E3087f33Ac04D78eE34f35D4d003c2D642',
    '0x7Bd9b22F89ECa14C5afa4de37Ae7B15C80de7a69',
    '0x32Bf5903EA9c98FB20eB07735a8e62D303B60B3C',
    '0xb5d2E6B148eBdFB02a3456F0Af021FAe81356511',
    '0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1',
  ].map((a) => a.toLowerCase())
);

/**
 * Returns true if the given escrow address is a V1 contract that uses
 * the inverted OutcomeSide enum (YES = 0, NO = 1).
 */
export function isV1EscrowContract(marketAddress: string): boolean {
  return V1_ESCROW_CONTRACTS.has(marketAddress.toLowerCase());
}

/**
 * Normalize a raw on-chain predictedOutcome to the canonical V2 enum.
 *
 * For V1 contracts the value is flipped (0 ↔ 1).
 * For V2 contracts the value is returned as-is.
 */
export function normalizeOutcomeSide(
  rawOutcome: number,
  marketAddress: string
): OutcomeSide {
  if (isV1EscrowContract(marketAddress)) {
    return rawOutcome === 0 ? OutcomeSide.YES : OutcomeSide.NO;
  }
  return rawOutcome as OutcomeSide;
}

/**
 * Type-safe check: did the predictor choose YES?
 *
 * Use this instead of raw `=== 0` / `=== 1` comparisons to avoid
 * bugs. Every callsite that interprets a predictedOutcome should
 * call this function.
 *
 * IMPORTANT: the value passed here must already be normalized to V2
 * convention (NO=0, YES=1). For raw on-chain values from legacy
 * contracts, call {@link normalizeOutcomeSide} first.
 */
export function isPredictedYes(predictedOutcome: number): boolean {
  return predictedOutcome === (OutcomeSide.YES as number);
}

/** Settlement result for a prediction */
export enum SettlementResult {
  UNRESOLVED = 0,
  PREDICTOR_WINS = 1,
  COUNTERPARTY_WINS = 2,
  NON_DECISIVE = 3, // Tie or weighted outcome
}

/** Outcome vector returned by condition resolvers */
export interface OutcomeVector {
  yesWeight: bigint;
  noWeight: bigint;
}

/** A single pick in a prediction/combo */
export interface Pick {
  conditionResolver: Address;
  conditionId: Hex;
  predictedOutcome: OutcomeSide;
}

/** Full prediction data stored on-chain */
export interface Prediction {
  predictionId: Hex;
  pickConfigId: Hex;
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  predictorTokensMinted: bigint;
  counterpartyTokensMinted: bigint;
  settled: boolean;
}

/** Pick configuration for fungible betting pools */
export interface PickConfiguration {
  pickConfigId: Hex;
  totalPredictorCollateral: bigint;
  totalCounterpartyCollateral: bigint;
  claimedPredictorCollateral: bigint;
  claimedCounterpartyCollateral: bigint;
  resolved: boolean;
  result: SettlementResult;
}

/** Session key approval data for ZeroDev integration */
export interface SessionKeyData {
  sessionKey: Address;
  owner: Address;
  validUntil: bigint;
  permissionsHash: Hex;
  chainId: bigint;
  ownerSignature: Hex;
}

/** Token pair for a prediction */
export interface TokenPair {
  predictorToken: Address;
  counterpartyToken: Address;
}

/** Escrow record for a prediction */
export interface EscrowRecord {
  pickConfigId: Hex;
  totalCollateral: bigint;
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictorTokensMinted: bigint;
  counterpartyTokensMinted: bigint;
  settled: boolean;
}

/**
 * Mint request data for creating a new prediction
 * Supports both EOA signatures and session key signatures
 */
export interface MintRequest {
  picks: Pick[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  predictorNonce: bigint;
  counterpartyNonce: bigint;
  predictorDeadline: bigint;
  counterpartyDeadline: bigint;
  predictorSignature: Hex;
  counterpartySignature: Hex;
  refCode: Hex;
  predictorSessionKeyData: Hex;
  counterpartySessionKeyData: Hex;
  // Sponsorship support (optional - zeroAddress = self-funded)
  predictorSponsor: Address;
  predictorSponsorData: Hex;
}

/**
 * Burn request data for bilateral position exit before resolution
 * Conservation: predictorPayout + counterpartyPayout == predictorTokenAmount + counterpartyTokenAmount
 */
export interface BurnRequest {
  pickConfigId: Hex;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorHolder: Address;
  counterpartyHolder: Address;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  predictorNonce: bigint;
  counterpartyNonce: bigint;
  predictorDeadline: bigint;
  counterpartyDeadline: bigint;
  predictorSignature: Hex;
  counterpartySignature: Hex;
  refCode: Hex;
  predictorSessionKeyData: Hex;
  counterpartySessionKeyData: Hex;
}

// ----- Relay/Transport types -----

/** Pick for JSON transport (string values instead of bigint) */
export interface PickJson {
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
}

/** Mint request for JSON transport */
export interface MintRequestJson {
  picks: PickJson[];
  predictorCollateral: string;
  counterpartyCollateral: string;
  predictor: string;
  counterparty: string;
  predictorNonce: number;
  counterpartyNonce: number;
  predictorDeadline: number;
  counterpartyDeadline: number;
  predictorSignature: string;
  counterpartySignature: string;
  refCode: string;
  predictorSessionKeyData?: string;
  counterpartySessionKeyData?: string;
}

/** Burn request for JSON transport */
export interface BurnRequestJson {
  pickConfigId: string;
  predictorTokenAmount: string;
  counterpartyTokenAmount: string;
  predictorHolder: string;
  counterpartyHolder: string;
  predictorPayout: string;
  counterpartyPayout: string;
  predictorNonce: number;
  counterpartyNonce: number;
  predictorDeadline: number;
  counterpartyDeadline: number;
  predictorSignature: string;
  counterpartySignature: string;
  refCode: string;
  predictorSessionKeyData?: string;
  counterpartySessionKeyData?: string;
}

// ============================================================================
// Relay/WebSocket Message Types
// ============================================================================

/**
 * Escrow auction request payload - initiates a prediction match request
 * The predictor submits their side and waits for a counterparty to fill
 */
/**
 * Step 1: RFQ intent — predictor broadcasts intent, no signature, no counterparty info.
 * The vault determines counterpartyCollateral (the quote).
 */
export interface AuctionRFQPayload {
  picks: PickJson[];
  predictorCollateral: string; // wei string
  counterpartyCollateral?: string; // wei string — optional at RFQ time, defaults to '0'
  predictor: string; // EOA or smart account address
  predictorNonce: number;
  predictorDeadline: number; // unix timestamp
  intentSignature?: string; // EIP-712 AuctionIntent — proves identity + intent, relayer-only
  chainId: number;
  refCode?: string;
  predictorSessionKeyData?: string; // ZeroDev session approval (base64)
  predictorSponsor?: string; // Sponsor contract address (address(0) = self-funded)
  predictorSponsorData?: string; // Opaque data passed to sponsor's fundMint
}

/**
 * Full auction request — used after predictor accepts a vault quote.
 * Contains both collaterals and the predictor's MintApproval signature.
 * This is assembled client-side for the mint() call; never sent through the relayer.
 */
export interface AuctionRequestPayload {
  picks: PickJson[];
  predictorCollateral: string; // wei string
  counterpartyCollateral: string; // wei string — required at mint time (from vault's bid)
  predictor: string; // EOA or smart account address
  predictorNonce: number;
  predictorDeadline: number; // unix timestamp
  intentSignature: string; // EIP-712 AuctionIntent
  predictorSignature: string; // EIP-712 MintApproval signature
  chainId: number;
  refCode?: string;
  predictorSessionKeyData?: string;
}

/**
 * Escrow bid payload - counterparty fills an auction
 */
export interface BidPayload {
  auctionId: string;
  counterparty: string; // EOA or smart account address
  counterpartyCollateral: string; // wei string - counterparty decides their collateral
  counterpartyNonce: number;
  counterpartyDeadline: number; // unix timestamp
  counterpartySignature: string; // EIP-712 MintApproval signature
  counterpartySessionKeyData?: string; // ZeroDev session approval (base64)
}

// ----- Client to Server Messages -----

export type ClientToServerMessage =
  | { type: 'auction.start'; payload: AuctionRFQPayload }
  | { type: 'auction.subscribe'; payload: { auctionId: string } }
  | { type: 'auction.unsubscribe'; payload: { auctionId: string } }
  | { type: 'bid.submit'; payload: BidPayload }
  | { type: 'ping' };

// ----- Server to Client Messages -----

/** Auction details broadcast to subscribers */
/** Broadcast to vaults when an auction starts — no counterpartyCollateral (vault decides) */
export interface AuctionDetails {
  auctionId: string;
  picks: PickJson[];
  predictorCollateral: string;
  counterpartyCollateral?: string; // optional — absent at RFQ time, present if predictor specified one
  predictor: string;
  predictorNonce: number;
  predictorDeadline: number;
  intentSignature?: string; // EIP-712 AuctionIntent — proves identity + intent
  predictorSessionKeyData?: string; // ZeroDev/escrow session approval
  chainId: number;
  createdAt: string; // ISO timestamp
  predictorSponsor?: string; // Sponsor contract address (address(0) = self-funded)
  predictorSponsorData?: string; // Opaque data passed to sponsor's fundMint
}

/** Bid that has been validated */
export interface ValidatedBid {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string; // wei string - counterparty's collateral
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
  receivedAt: string; // ISO timestamp
}

export type ServerToClientMessage =
  | {
      type: 'auction.ack';
      payload: {
        auctionId?: string;
        error?: string;
        subscribed?: boolean;
        unsubscribed?: boolean;
        id?: string; // Request ID for correlation with sendWithAck
      };
    }
  | { type: 'bid.ack'; payload: { bidId?: string; error?: string } }
  | { type: 'auction.started'; payload: AuctionDetails }
  | {
      type: 'auction.bids';
      payload: { auctionId: string; bids: ValidatedBid[] };
    }
  | {
      type: 'auction.filled';
      payload: {
        auctionId: string;
        predictionId: string;
        pickConfigId: string;
        transactionHash: string;
      };
    }
  | {
      type: 'auction.expired';
      payload: { auctionId: string; reason: string };
    }
  | { type: 'pong' }
  | { type: 'error'; payload: { message: string; code?: string } };
