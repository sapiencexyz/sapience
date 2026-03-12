/**
 * Escrow Signature Verification
 * Verifies EIP-712 typed data signatures for escrow predictions.
 *
 * Intent verification delegates to the SDK's `verifyAuctionIntentSignature`,
 * which handles EOA and escrow session key paths. The relayer layers on
 * ZeroDev session key support and smart account address resolution.
 */

import {
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  verifyAuctionIntentSignature as sdkVerifyAuctionIntentSignature,
  verifyCounterpartyMintSignature as sdkVerifyCounterpartyMintSignature,
} from '@sapience/sdk/auction/escrowSigning';
import type { Pick } from '@sapience/sdk/types';
import type { AuctionRFQPayload, BidPayload } from './escrowTypes';
import {
  verifySessionApproval,
  computeSmartAccountAddress,
  type SessionApprovalPayload,
} from './sessionAuth';

/**
 * Convert JSON picks to SDK Pick format
 */
function convertPicks(picks: AuctionRFQPayload['picks']): Pick[] {
  return picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));
}

/**
 * Convert typed data with bigint chainId to number for viem compatibility
 */
function convertTypedDataForViem<T extends { domain: { chainId?: bigint | number } }>(
  typedData: T
): T & { domain: { chainId?: number } } {
  return {
    ...typedData,
    domain: {
      ...typedData.domain,
      chainId:
        typedData.domain.chainId !== undefined
          ? Number(typedData.domain.chainId)
          : undefined,
    },
  };
}

/**
 * Verifies the counterparty's EIP-712 signature for an escrow bid
 *
 * @param bid - The escrow bid payload
 * @param auction - The escrow auction request (to get picks and wagers)
 * @param verifyingContract - The PredictionMarketEscrow contract address
 * @returns true if signature is valid
 */
export async function verifyEscrowCounterpartySignature(
  bid: BidPayload,
  auction: AuctionRFQPayload,
  verifyingContract: Address
): Promise<boolean> {
  if (!bid.counterpartySignature) {
    return false;
  }

  const picks = convertPicks(auction.picks);

  // Delegate to SDK verification (escrow session key + EOA + smart account owner)
  const result = await sdkVerifyCounterpartyMintSignature({
    picks,
    predictorCollateral: BigInt(auction.predictorCollateral),
    counterpartyCollateral: BigInt(bid.counterpartyCollateral),
    predictor: auction.predictor as Address,
    counterparty: bid.counterparty as Address,
    counterpartyNonce: BigInt(bid.counterpartyNonce),
    counterpartyDeadline: BigInt(bid.counterpartyDeadline),
    counterpartySignature: bid.counterpartySignature as Hex,
    counterpartySessionKeyData: bid.counterpartySessionKeyData,
    predictorSponsor: (auction.predictorSponsor ?? '0x0000000000000000000000000000000000000000') as Address,
    predictorSponsorData: (auction.predictorSponsorData ?? '0x') as Hex,
    verifyingContract,
    chainId: auction.chainId,
    resolveSmartAccountAddress: computeSmartAccountAddress,
  });

  if (result.valid) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Escrow-Sig] Valid counterparty signature, recovered:', result.recoveredAddress);
    }
    return true;
  }

  // Fallback: ZeroDev session key (base64 JSON format)
  if (bid.counterpartySessionKeyData && !bid.counterpartySessionKeyData.startsWith('0x')) {
    try {
      const counterpartyAddress = bid.counterparty.toLowerCase() as Address;

      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: bid.counterpartySessionKeyData,
        chainId: auction.chainId,
        typedData: undefined,
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        counterpartyAddress,
        computeSmartAccountAddress,
      );

      if (sessionResult.valid && sessionResult.sessionKeyAddress) {
        const { buildCounterpartyMintTypedData } = await import(
          '@sapience/sdk/auction/escrowSigning'
        );

        const rawTypedData = buildCounterpartyMintTypedData({
          picks,
          predictorCollateral: BigInt(auction.predictorCollateral),
          counterpartyCollateral: BigInt(bid.counterpartyCollateral),
          predictor: auction.predictor as Address,
          counterparty: bid.counterparty as Address,
          counterpartyNonce: BigInt(bid.counterpartyNonce),
          counterpartyDeadline: BigInt(bid.counterpartyDeadline),
          predictorSponsor: (auction.predictorSponsor ?? '0x0000000000000000000000000000000000000000') as Address,
          predictorSponsorData: (auction.predictorSponsorData ?? '0x') as Hex,
          verifyingContract,
          chainId: auction.chainId,
        });

        const typedData = convertTypedDataForViem(rawTypedData);

        const recoveredSigner = await recoverTypedDataAddress({
          ...typedData,
          signature: bid.counterpartySignature as Hex,
        });

        if (recoveredSigner.toLowerCase() === sessionResult.sessionKeyAddress.toLowerCase()) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug(
              '[Escrow-Sig] Valid counterparty ZeroDev session approval for account:',
              counterpartyAddress
            );
          }
          return true;
        }
      }
    } catch (error) {
      console.error('[Escrow-Sig] ZeroDev counterparty session key verification error:', error);
    }
  }

  console.warn(
    '[Escrow-Sig] Counterparty signature verification failed: recovered signer does not match'
  );
  return false;
}

// ============================================================================
// Auction Intent Verification (RFQ lightweight auth)
// ============================================================================

/**
 * Verify the predictor's AuctionIntent signature at RFQ start.
 *
 * Delegates to the SDK's `verifyAuctionIntentSignature` which handles:
 *   - EOA signatures
 *   - Escrow session keys (ABI-encoded hex)
 *   - Smart account owner resolution (via `computeSmartAccountAddress`)
 *
 * The relayer layers on ZeroDev session key support (base64 JSON format)
 * as a fallback when the SDK's paths don't match.
 */
export async function verifyAuctionIntentSignature(
  payload: AuctionRFQPayload,
  verifyingContract: Address
): Promise<boolean> {
  if (!payload.intentSignature) {
    return false;
  }

  const picks = convertPicks(payload.picks);

  // Try SDK verification (EOA + escrow session key + smart account owner)
  const result = await sdkVerifyAuctionIntentSignature({
    picks,
    predictor: payload.predictor as Address,
    predictorCollateral: BigInt(payload.predictorCollateral),
    predictorNonce: BigInt(payload.predictorNonce),
    predictorDeadline: BigInt(payload.predictorDeadline),
    intentSignature: payload.intentSignature as Hex,
    predictorSessionKeyData: payload.predictorSessionKeyData,
    verifyingContract,
    chainId: payload.chainId,
    resolveSmartAccountAddress: computeSmartAccountAddress,
  });

  if (result.valid) {
    return true;
  }

  // Fallback: ZeroDev session key (base64 JSON format or JSON with typedData)
  if (payload.predictorSessionKeyData && !payload.predictorSessionKeyData.startsWith('0x')) {
    try {
      // Parse session key data — may be a JSON object with {approval, typedData}
      // or a raw base64 approval string
      let approvalStr = payload.predictorSessionKeyData;
      let typedData: SessionApprovalPayload['typedData'] = undefined;
      try {
        const parsed = JSON.parse(payload.predictorSessionKeyData);
        if (parsed && typeof parsed === 'object' && parsed.approval) {
          approvalStr = parsed.approval;
          typedData = parsed.typedData ?? undefined;
        }
      } catch {
        // Not JSON — treat as raw base64 approval string
      }

      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: approvalStr,
        chainId: payload.chainId,
        typedData,
      };

      const predictorAddress = payload.predictor.toLowerCase() as Address;

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        predictorAddress,
        computeSmartAccountAddress,
      );

      if (sessionResult.valid && sessionResult.sessionKeyAddress) {
        const { buildAuctionIntentTypedData } = await import(
          '@sapience/sdk/auction/escrowSigning'
        );

        const rawTypedData = buildAuctionIntentTypedData({
          picks,
          predictor: payload.predictor as Address,
          predictorCollateral: BigInt(payload.predictorCollateral),
          predictorNonce: BigInt(payload.predictorNonce),
          predictorDeadline: BigInt(payload.predictorDeadline),
          verifyingContract,
          chainId: payload.chainId,
        });

        const typedData = convertTypedDataForViem(rawTypedData);

        const recoveredSigner = await recoverTypedDataAddress({
          ...typedData,
          signature: payload.intentSignature as Hex,
        });

        if (recoveredSigner.toLowerCase() === sessionResult.sessionKeyAddress.toLowerCase()) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug(
              '[Escrow-Sig] Valid predictor intent ZeroDev session approval for account:',
              predictorAddress
            );
          }
          return true;
        }
      }
    } catch (error) {
      console.error('[Escrow-Sig] ZeroDev session key verification error:', error);
    }
  }

  console.warn(
    '[Escrow-Sig] Intent signature verification failed: recovered signer does not match'
  );
  return false;
}
