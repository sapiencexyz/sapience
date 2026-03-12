import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import type { Pick, MintRequest, BurnRequest } from '../types/escrow';
import { computePickConfigId } from './escrowEncoding';

// ============================================================================
// EIP-712 Domain & Types
// ============================================================================

/**
 * EIP-712 domain for PredictionMarketEscrow
 */
export function getEscrowDomain(
  verifyingContract: Address,
  chainId: number
): TypedDataDomain {
  return {
    name: 'PredictionMarketEscrow',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

/**
 * EIP-712 types for MintApproval
 * Matches SignatureValidator.MINT_APPROVAL_TYPEHASH
 */
export const MINT_APPROVAL_TYPES = {
  MintApproval: [
    { name: 'predictionHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'collateral', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * EIP-712 types for BurnApproval
 * Matches SignatureValidator.BURN_APPROVAL_TYPEHASH
 */
export const BURN_APPROVAL_TYPES = {
  BurnApproval: [
    { name: 'burnHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'tokenAmount', type: 'uint256' },
    { name: 'payout', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * EIP-712 types for AuctionIntent (lightweight auth at RFQ start)
 * Relayer-only verification — proves predictor identity + intent without
 * committing to counterparty details. NOT verified on-chain.
 */
export const AUCTION_INTENT_TYPES = {
  AuctionIntent: [
    { name: 'picks', type: 'Pick[]' },
    { name: 'predictor', type: 'address' },
    { name: 'predictorCollateral', type: 'uint256' },
    { name: 'predictorNonce', type: 'uint256' },
    { name: 'predictorDeadline', type: 'uint256' },
  ],
  Pick: [
    { name: 'conditionResolver', type: 'address' },
    { name: 'conditionId', type: 'bytes32' },
    { name: 'predictedOutcome', type: 'uint8' },
  ],
} as const;

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Compute predictionHash for mint signatures
 *
 * Mirrors `PredictionMarketEscrow.mint`:
 * `keccak256(abi.encode(pickConfigId, predictorCollateral, counterpartyCollateral, predictor, counterparty, predictorSponsor, predictorSponsorData))`
 */
export function computePredictionHash(
  pickConfigId: Hex,
  predictorCollateral: bigint,
  counterpartyCollateral: bigint,
  predictor: Address,
  counterparty: Address,
  predictorSponsor: Address,
  predictorSponsorData: Hex
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'bytes' },
      ],
      [
        pickConfigId,
        predictorCollateral,
        counterpartyCollateral,
        predictor,
        counterparty,
        predictorSponsor,
        predictorSponsorData,
      ]
    )
  );
}

/**
 * Compute predictionHash directly from picks array
 */
export function computePredictionHashFromPicks(
  picks: Pick[],
  predictorCollateral: bigint,
  counterpartyCollateral: bigint,
  predictor: Address,
  counterparty: Address,
  predictorSponsor: Address,
  predictorSponsorData: Hex
): Hex {
  const pickConfigId = computePickConfigId(picks);
  return computePredictionHash(
    pickConfigId,
    predictorCollateral,
    counterpartyCollateral,
    predictor,
    counterparty,
    predictorSponsor,
    predictorSponsorData
  );
}

/**
 * Compute burnHash for burn signatures
 *
 * Mirrors `PredictionMarketEscrow.burn`:
 * `keccak256(abi.encode(pickConfigId, predictorTokenAmount, counterpartyTokenAmount, predictorHolder, counterpartyHolder, predictorPayout, counterpartyPayout))`
 */
export function computeBurnHash(
  pickConfigId: Hex,
  predictorTokenAmount: bigint,
  counterpartyTokenAmount: bigint,
  predictorHolder: Address,
  counterpartyHolder: Address,
  predictorPayout: bigint,
  counterpartyPayout: bigint
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        pickConfigId,
        predictorTokenAmount,
        counterpartyTokenAmount,
        predictorHolder,
        counterpartyHolder,
        predictorPayout,
        counterpartyPayout,
      ]
    )
  );
}

// ============================================================================
// Typed Data Builders (for signing)
// ============================================================================

/**
 * Build EIP-712 typed data for mint approval
 * This is what each party signs for their portion of the mint
 */
export function buildMintApprovalTypedData(params: {
  predictionHash: Hex;
  signer: Address;
  collateral: bigint;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  return {
    domain: getEscrowDomain(params.verifyingContract, params.chainId),
    types: MINT_APPROVAL_TYPES,
    primaryType: 'MintApproval' as const,
    message: {
      predictionHash: params.predictionHash,
      signer: params.signer,
      collateral: params.collateral,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

/**
 * Build EIP-712 typed data for burn approval
 * This is what each party signs for their portion of the burn
 */
export function buildBurnApprovalTypedData(params: {
  burnHash: Hex;
  signer: Address;
  tokenAmount: bigint;
  payout: bigint;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  return {
    domain: getEscrowDomain(params.verifyingContract, params.chainId),
    types: BURN_APPROVAL_TYPES,
    primaryType: 'BurnApproval' as const,
    message: {
      burnHash: params.burnHash,
      signer: params.signer,
      tokenAmount: params.tokenAmount,
      payout: params.payout,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

// ============================================================================
// Hash Computation for Verification
// ============================================================================

/**
 * Compute the EIP-712 hash for mint approval
 * This is the hash that will be signed
 */
export function hashMintApproval(params: {
  predictionHash: Hex;
  signer: Address;
  collateral: bigint;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}): Hex {
  const typedData = buildMintApprovalTypedData(params);
  return hashTypedData(typedData);
}

/**
 * Compute the EIP-712 hash for burn approval
 * This is the hash that will be signed
 */
export function hashBurnApproval(params: {
  burnHash: Hex;
  signer: Address;
  tokenAmount: bigint;
  payout: bigint;
  nonce: bigint;
  deadline: bigint;
  verifyingContract: Address;
  chainId: number;
}): Hex {
  const typedData = buildBurnApprovalTypedData(params);
  return hashTypedData(typedData);
}

// ============================================================================
// Full Request Typed Data Builders
// ============================================================================

/**
 * Build typed data for predictor's mint signature
 */
export function buildPredictorMintTypedData(params: {
  picks: Pick[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  predictorNonce: bigint;
  predictorDeadline: bigint;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
  verifyingContract: Address;
  chainId: number;
}) {
  const predictionHash = computePredictionHashFromPicks(
    params.picks,
    params.predictorCollateral,
    params.counterpartyCollateral,
    params.predictor,
    params.counterparty,
    params.predictorSponsor ?? zeroAddress,
    params.predictorSponsorData ?? '0x',
  );

  return buildMintApprovalTypedData({
    predictionHash,
    signer: params.predictor,
    collateral: params.predictorCollateral,
    nonce: params.predictorNonce,
    deadline: params.predictorDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

/**
 * Build typed data for counterparty's mint signature
 */
export function buildCounterpartyMintTypedData(params: {
  picks: Pick[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  counterpartyNonce: bigint;
  counterpartyDeadline: bigint;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
  verifyingContract: Address;
  chainId: number;
}) {
  const predictionHash = computePredictionHashFromPicks(
    params.picks,
    params.predictorCollateral,
    params.counterpartyCollateral,
    params.predictor,
    params.counterparty,
    params.predictorSponsor ?? zeroAddress,
    params.predictorSponsorData ?? '0x',
  );

  return buildMintApprovalTypedData({
    predictionHash,
    signer: params.counterparty,
    collateral: params.counterpartyCollateral,
    nonce: params.counterpartyNonce,
    deadline: params.counterpartyDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

/**
 * Build typed data for predictor holder's burn signature
 */
export function buildPredictorBurnTypedData(params: {
  pickConfigId: Hex;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorHolder: Address;
  counterpartyHolder: Address;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  predictorNonce: bigint;
  predictorDeadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  const burnHash = computeBurnHash(
    params.pickConfigId,
    params.predictorTokenAmount,
    params.counterpartyTokenAmount,
    params.predictorHolder,
    params.counterpartyHolder,
    params.predictorPayout,
    params.counterpartyPayout
  );

  return buildBurnApprovalTypedData({
    burnHash,
    signer: params.predictorHolder,
    tokenAmount: params.predictorTokenAmount,
    payout: params.predictorPayout,
    nonce: params.predictorNonce,
    deadline: params.predictorDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

/**
 * Build typed data for counterparty holder's burn signature
 */
export function buildCounterpartyBurnTypedData(params: {
  pickConfigId: Hex;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorHolder: Address;
  counterpartyHolder: Address;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  counterpartyNonce: bigint;
  counterpartyDeadline: bigint;
  verifyingContract: Address;
  chainId: number;
}) {
  const burnHash = computeBurnHash(
    params.pickConfigId,
    params.predictorTokenAmount,
    params.counterpartyTokenAmount,
    params.predictorHolder,
    params.counterpartyHolder,
    params.predictorPayout,
    params.counterpartyPayout
  );

  return buildBurnApprovalTypedData({
    burnHash,
    signer: params.counterpartyHolder,
    tokenAmount: params.counterpartyTokenAmount,
    payout: params.counterpartyPayout,
    nonce: params.counterpartyNonce,
    deadline: params.counterpartyDeadline,
    verifyingContract: params.verifyingContract,
    chainId: params.chainId,
  });
}

// ============================================================================
// Auction Intent (lightweight RFQ auth)
// ============================================================================

/**
 * Build EIP-712 typed data for auction intent (RFQ step 1).
 * Proves predictor identity + intent without committing to counterparty details.
 * Relayer-only — NOT verified on-chain.
 */
export function buildAuctionIntentTypedData(params: {
  picks: Pick[];
  predictor: Address;
  predictorCollateral: bigint;
  predictorNonce: bigint;
  predictorDeadline: bigint;
  verifyingContract: Address;
  chainId: number;
}): {
  domain: TypedDataDomain;
  types: typeof AUCTION_INTENT_TYPES;
  primaryType: 'AuctionIntent';
  message: {
    picks: { conditionResolver: Address; conditionId: Hex; predictedOutcome: number }[];
    predictor: Address;
    predictorCollateral: bigint;
    predictorNonce: bigint;
    predictorDeadline: bigint;
  };
} {
  return {
    domain: getEscrowDomain(params.verifyingContract, params.chainId),
    types: AUCTION_INTENT_TYPES,
    primaryType: 'AuctionIntent' as const,
    message: {
      picks: params.picks.map((p) => ({
        conditionResolver: p.conditionResolver,
        // EIP-712 type is bytes32; hash long conditionIds (e.g. Pyth raw encoding)
        conditionId:
          p.conditionId.length > 66
            ? keccak256(p.conditionId)
            : p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
      predictor: params.predictor,
      predictorCollateral: params.predictorCollateral,
      predictorNonce: params.predictorNonce,
      predictorDeadline: params.predictorDeadline,
    },
  };
}
