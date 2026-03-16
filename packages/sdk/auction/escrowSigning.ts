import {
  decodeAbiParameters,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import type { Pick, MintRequest, BurnRequest } from '../types/escrow';
import { computePickConfigId } from './escrowEncoding';
import {
  verifySessionApproval,
  type SessionApprovalPayload,
} from '../session/verification';
import { computeSmartAccountAddress } from '../session/smartAccount';

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
    { name: 'conditionId', type: 'bytes' },
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
    params.predictorSponsorData ?? '0x'
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
    params.predictorSponsorData ?? '0x'
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
    picks: {
      conditionResolver: Address;
      conditionId: Hex;
      predictedOutcome: number;
    }[];
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
        // EIP-712 type is bytes — pass conditionId as-is
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
      predictor: params.predictor,
      predictorCollateral: params.predictorCollateral,
      predictorNonce: params.predictorNonce,
      predictorDeadline: params.predictorDeadline,
    },
  };
}

// ============================================================================
// Auction Intent Verification
// ============================================================================

/**
 * Decoded escrow SessionKeyData from ABI-encoded bytes.
 * This is the on-chain format where the owner signs a SessionKeyApproval
 * authorizing a session key to act on behalf of the smart account.
 */
interface DecodedEscrowSessionKeyData {
  sessionKey: Address;
  owner: Address;
  validUntil: bigint;
  permissionsHash: Hex;
  chainId: bigint;
  ownerSignature: Hex;
}

/**
 * Decode escrow SessionKeyData from ABI-encoded hex bytes.
 * Format: 32-byte offset pointer + struct fields.
 */
function decodeEscrowSessionKeyData(
  data: string
): DecodedEscrowSessionKeyData | null {
  try {
    if (!data.startsWith('0x') || data.length < 66) return null;

    // Skip the 32-byte offset pointer (0x + 64 hex chars)
    const structData = ('0x' + data.slice(66)) as Hex;

    const decoded = decodeAbiParameters(
      [
        { name: 'sessionKey', type: 'address' },
        { name: 'owner', type: 'address' },
        { name: 'validUntil', type: 'uint256' },
        { name: 'permissionsHash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'ownerSignature', type: 'bytes' },
      ],
      structData
    );

    return {
      sessionKey: decoded[0] as Address,
      owner: decoded[1] as Address,
      validUntil: decoded[2] as bigint,
      permissionsHash: decoded[3] as Hex,
      chainId: decoded[4] as bigint,
      ownerSignature: decoded[5] as Hex,
    };
  } catch (e) {
    console.debug(
      '[escrowSigning] Failed to decode escrow session key data:',
      e
    );
    return null;
  }
}

/**
 * Verify escrow SessionKeyData by recovering the owner signature
 * from the SessionKeyApproval typed data.
 */
async function verifyEscrowSessionKey(
  sessionKeyData: DecodedEscrowSessionKeyData,
  smartAccount: Address,
  verifyingContract: Address
): Promise<{ valid: boolean; sessionKeyAddress?: Address }> {
  try {
    // Check expiry
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Number(sessionKeyData.validUntil) < nowSeconds) {
      return { valid: false };
    }

    // Recover owner from SessionKeyApproval typed data
    const recoveredOwner = await recoverTypedDataAddress({
      domain: {
        name: 'PredictionMarketEscrow',
        version: '1',
        chainId: Number(sessionKeyData.chainId),
        verifyingContract,
      },
      types: {
        SessionKeyApproval: [
          { name: 'sessionKey', type: 'address' },
          { name: 'smartAccount', type: 'address' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'permissionsHash', type: 'bytes32' },
          { name: 'chainId', type: 'uint256' },
        ],
      },
      primaryType: 'SessionKeyApproval' as const,
      message: {
        sessionKey: sessionKeyData.sessionKey,
        smartAccount,
        validUntil: sessionKeyData.validUntil,
        permissionsHash: sessionKeyData.permissionsHash,
        chainId: sessionKeyData.chainId,
      },
      signature: sessionKeyData.ownerSignature,
    });

    if (recoveredOwner.toLowerCase() !== sessionKeyData.owner.toLowerCase()) {
      return { valid: false };
    }

    return { valid: true, sessionKeyAddress: sessionKeyData.sessionKey };
  } catch (e) {
    console.debug('[escrowSigning] Escrow session key verification error:', e);
    return { valid: false };
  }
}

/**
 * Verify the predictor's AuctionIntent EIP-712 signature.
 *
 * Supports four verification paths:
 * 1. **Escrow session key** — if `predictorSessionKeyData` is ABI-encoded hex,
 *    verifies the owner approved the session key, then checks the intent signature
 *    was produced by that session key.
 * 2. **EOA** — recovers the signer and checks it matches the predictor address.
 * 3. **Smart account owner** — checks whether the recovered signer's derived
 *    smart account matches the predictor (pure CREATE2, no RPC).
 * 4. **ZeroDev session key** — JSON with approval + typedData.
 *
 * @returns `{ valid, recoveredAddress }` — `recoveredAddress` is the EOA that
 *   produced the signature, useful for callers that want to handle the smart account
 *   path themselves.
 */
export async function verifyAuctionIntentSignature(params: {
  picks: Pick[];
  predictor: Address;
  predictorCollateral: bigint;
  predictorNonce: bigint;
  predictorDeadline: bigint;
  intentSignature: Hex;
  predictorSessionKeyData?: string;
  verifyingContract: Address;
  chainId: number;
}): Promise<{ valid: boolean; recoveredAddress?: Address }> {
  try {
    const rawTypedData = buildAuctionIntentTypedData({
      picks: params.picks,
      predictor: params.predictor,
      predictorCollateral: params.predictorCollateral,
      predictorNonce: params.predictorNonce,
      predictorDeadline: params.predictorDeadline,
      verifyingContract: params.verifyingContract,
      chainId: params.chainId,
    });

    // Convert bigint chainId to number for viem's recoverTypedDataAddress
    const typedData = {
      ...rawTypedData,
      domain: {
        ...rawTypedData.domain,
        chainId: Number(rawTypedData.domain.chainId),
      },
    };

    const predictorAddress = params.predictor.toLowerCase();

    // Path 1: Escrow session key (ABI-encoded hex)
    if (params.predictorSessionKeyData?.startsWith('0x')) {
      const escrowSessionData = decodeEscrowSessionKeyData(
        params.predictorSessionKeyData
      );
      if (escrowSessionData) {
        const escrowResult = await verifyEscrowSessionKey(
          escrowSessionData,
          predictorAddress as Address,
          params.verifyingContract
        );

        if (escrowResult.valid && escrowResult.sessionKeyAddress) {
          const recoveredSigner = await recoverTypedDataAddress({
            ...typedData,
            signature: params.intentSignature,
          });

          if (
            recoveredSigner.toLowerCase() ===
            escrowResult.sessionKeyAddress.toLowerCase()
          ) {
            return { valid: true, recoveredAddress: recoveredSigner };
          }
        }
        // Fall through to EOA/smart account paths
      }
    }

    // Path 2: Direct EOA verification
    const recovered = await recoverTypedDataAddress({
      ...typedData,
      signature: params.intentSignature,
    });

    if (recovered.toLowerCase() === predictorAddress) {
      return { valid: true, recoveredAddress: recovered };
    }

    // Path 3: Smart account owner — recovered EOA owns the smart account
    {
      const expectedSmartAccount = computeSmartAccountAddress(recovered);
      if (expectedSmartAccount.toLowerCase() === predictorAddress) {
        return { valid: true, recoveredAddress: recovered };
      }
    }

    // Path 4: ZeroDev session key (JSON with approval + typedData)
    // The session key signs with raw ECDSA; the approval proves the owner
    // authorized this session key for the predictor's smart account.
    if (
      params.predictorSessionKeyData &&
      !params.predictorSessionKeyData.startsWith('0x')
    ) {
      try {
        let approvalStr = params.predictorSessionKeyData;
        let sessionTypedData: SessionApprovalPayload['typedData'] = undefined;
        try {
          const parsed = JSON.parse(params.predictorSessionKeyData);
          if (parsed && typeof parsed === 'object' && parsed.approval) {
            approvalStr = parsed.approval;
            sessionTypedData = parsed.typedData ?? undefined;
          }
        } catch {
          // Not JSON — treat as raw base64 approval string
        }

        const sessionResult = await verifySessionApproval(
          {
            approval: approvalStr,
            chainId: params.chainId,
            typedData: sessionTypedData,
          },
          predictorAddress as Address
        );

        if (sessionResult.valid && sessionResult.sessionKeyAddress) {
          if (
            recovered.toLowerCase() ===
            sessionResult.sessionKeyAddress.toLowerCase()
          ) {
            return { valid: true, recoveredAddress: recovered };
          }
        }
      } catch {
        // Session verification failed — fall through
      }
    }

    return { valid: false, recoveredAddress: recovered };
  } catch (e) {
    console.debug('[escrowSigning] Intent signature verification error:', e);
    return { valid: false };
  }
}

/**
 * Verify the counterparty's MintApproval EIP-712 signature.
 *
 * Supports three verification paths (mirrors `verifyAuctionIntentSignature`):
 * 1. **Escrow session key** — if `counterpartySessionKeyData` is ABI-encoded hex,
 *    verifies the owner approved the session key, then checks the mint signature
 *    was produced by that session key.
 * 2. **EOA** — recovers the signer and checks it matches the counterparty address.
 * 3. **Smart account owner** — checks whether the recovered signer's derived
 *    smart account matches the counterparty (pure CREATE2, no RPC).
 *
 * @returns `{ valid, recoveredAddress }` — `recoveredAddress` is the EOA that
 *   produced the signature.
 */
export async function verifyCounterpartyMintSignature(params: {
  picks: Pick[];
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  predictor: Address;
  counterparty: Address;
  counterpartyNonce: bigint;
  counterpartyDeadline: bigint;
  counterpartySignature: Hex;
  counterpartySessionKeyData?: string;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
  verifyingContract: Address;
  chainId: number;
}): Promise<{ valid: boolean; recoveredAddress?: Address }> {
  try {
    const rawTypedData = buildCounterpartyMintTypedData({
      picks: params.picks,
      predictorCollateral: params.predictorCollateral,
      counterpartyCollateral: params.counterpartyCollateral,
      predictor: params.predictor,
      counterparty: params.counterparty,
      counterpartyNonce: params.counterpartyNonce,
      counterpartyDeadline: params.counterpartyDeadline,
      predictorSponsor: params.predictorSponsor,
      predictorSponsorData: params.predictorSponsorData,
      verifyingContract: params.verifyingContract,
      chainId: params.chainId,
    });

    // Convert bigint chainId to number for viem's recoverTypedDataAddress
    const typedData = {
      ...rawTypedData,
      domain: {
        ...rawTypedData.domain,
        chainId: Number(rawTypedData.domain.chainId),
      },
    };

    const counterpartyAddress = params.counterparty.toLowerCase();

    // Path 1: Escrow session key (ABI-encoded hex)
    if (params.counterpartySessionKeyData?.startsWith('0x')) {
      const escrowSessionData = decodeEscrowSessionKeyData(
        params.counterpartySessionKeyData
      );
      if (escrowSessionData) {
        const escrowResult = await verifyEscrowSessionKey(
          escrowSessionData,
          counterpartyAddress as Address,
          params.verifyingContract
        );

        if (escrowResult.valid && escrowResult.sessionKeyAddress) {
          const recoveredSigner = await recoverTypedDataAddress({
            ...typedData,
            signature: params.counterpartySignature,
          });

          if (
            recoveredSigner.toLowerCase() ===
            escrowResult.sessionKeyAddress.toLowerCase()
          ) {
            return { valid: true, recoveredAddress: recoveredSigner };
          }
        }
        // Fall through to EOA/smart account paths
      }
    }

    // Path 2: Direct EOA verification
    const recovered = await recoverTypedDataAddress({
      ...typedData,
      signature: params.counterpartySignature,
    });

    if (recovered.toLowerCase() === counterpartyAddress) {
      return { valid: true, recoveredAddress: recovered };
    }

    // Path 3: Smart account owner — recovered EOA owns the smart account
    {
      const expectedSmartAccount = computeSmartAccountAddress(recovered);
      if (expectedSmartAccount.toLowerCase() === counterpartyAddress) {
        return { valid: true, recoveredAddress: recovered };
      }
    }

    return { valid: false, recoveredAddress: recovered };
  } catch (e) {
    console.debug(
      '[escrowSigning] Counterparty mint signature verification error:',
      e
    );
    return { valid: false };
  }
}
