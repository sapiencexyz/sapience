import type { Address, Hex } from 'viem';

/**
 * V2 Prediction Market Types
 * TypeScript equivalents of the Solidity types in IV2Types.sol
 */

/** Outcome side for a pick */
export enum OutcomeSide {
  YES = 0,
  NO = 1,
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

/** A single pick in a prediction/parlay */
export interface Pick {
  conditionResolver: Address;
  conditionId: Hex;
  predictedOutcome: OutcomeSide;
}

/** Full prediction data stored on-chain */
export interface Prediction {
  predictionId: Hex;
  pickConfigId: Hex;
  predictorWager: bigint;
  counterpartyWager: bigint;
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
  predictorWager: bigint;
  counterpartyWager: bigint;
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
  predictorWager: bigint;
  counterpartyWager: bigint;
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
  predictorWager: string;
  counterpartyWager: string;
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
