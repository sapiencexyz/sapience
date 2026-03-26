import type { Address, Hex } from 'viem';

/**
 * Prediction Market Types
 * TypeScript equivalents of the Solidity types in the PredictionMarketEscrow contract
 */

/**
 * Outcome side for a pick.
 *
 * YES = 0, NO = 1. This mirrors the Solidity enum (IV2Types.OutcomeSide)
 * where values are assigned by declaration order. The ordering is
 * load-bearing: it is ABI-encoded as uint8, hashed into pickConfigId,
 * and embedded in EIP-712 signatures. Changing it would break all
 * existing positions.
 *
 * This is an enum rather than a boolean because resolution can be
 * non-decisive (tie) — the OutcomeVector [1,1] represents a result
 * where neither YES nor NO wins outright. Using an enum keeps the
 * prediction side extensible without conflating it with resolution.
 */
export enum OutcomeSide {
  YES = 0,
  NO = 1,
}

/**
 * Type-safe check: did the predictor choose YES?
 *
 * Use this instead of raw `=== 0` / `=== 1` comparisons to avoid
 * the counterintuitive YES=0 mapping causing bugs. Every callsite
 * that interprets a predictedOutcome should call this function.
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
