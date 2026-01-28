/**
 * V2 Signature Verification
 * Verifies EIP-712 typed data signatures for V2 predictions
 */

import {
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  buildPredictorMintTypedData,
  buildCounterpartyMintTypedData,
} from '@sapience/sdk/auction/v2Signing';
import type { Pick } from '@sapience/sdk/types/v2';
import type { V2AuctionRequestPayload, V2BidPayload } from './v2Types';
import {
  verifySessionApproval,
  computeSmartAccountAddress,
  type SessionApprovalPayload,
} from './sessionAuth';

/**
 * Convert JSON picks to SDK Pick format
 */
function convertPicks(picks: V2AuctionRequestPayload['picks']): Pick[] {
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
 * Verifies the predictor's EIP-712 signature for a V2 auction request
 *
 * @param payload - The V2 auction request payload
 * @param verifyingContract - The PredictionMarketEscrow contract address
 * @param counterparty - Placeholder counterparty address (can be zero for auction start)
 * @returns true if signature is valid
 */
export async function verifyV2PredictorSignature(
  payload: V2AuctionRequestPayload,
  verifyingContract: Address,
  counterparty: Address = '0x0000000000000000000000000000000000000000'
): Promise<boolean> {
  if (!payload.predictorSignature) {
    return false;
  }

  try {
    const picks = convertPicks(payload.picks);

    // Build the typed data that should have been signed
    const rawTypedData = buildPredictorMintTypedData({
      picks,
      predictorWager: BigInt(payload.predictorWager),
      counterpartyWager: BigInt(payload.counterpartyWager),
      predictor: payload.predictor as Address,
      counterparty,
      predictorNonce: BigInt(payload.predictorNonce),
      predictorDeadline: BigInt(payload.predictorDeadline),
      verifyingContract,
      chainId: payload.chainId,
    });

    // Convert chainId to number for viem
    const typedData = convertTypedDataForViem(rawTypedData);

    const predictorAddress = payload.predictor.toLowerCase() as Address;
    const signature = payload.predictorSignature as Hex;

    // Path 1: If session key data is present, verify via ZeroDev session
    if (payload.predictorSessionKeyData) {
      // Parse the session approval from base64
      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: payload.predictorSessionKeyData,
        chainId: payload.chainId,
        typedData: undefined, // V2 uses EIP-712, not session typed data for the approval itself
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        predictorAddress
      );

      if (sessionResult.valid && sessionResult.sessionKeyAddress) {
        // Session approval is valid - verify the signature was signed by the session key
        const recoveredSigner = await recoverTypedDataAddress({
          ...typedData,
          signature,
        });

        if (
          recoveredSigner.toLowerCase() !==
          sessionResult.sessionKeyAddress.toLowerCase()
        ) {
          console.warn('[V2-Sig] Predictor signature not from session key:', {
            expected: sessionResult.sessionKeyAddress,
            recovered: recoveredSigner,
          });
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[V2-Sig] Valid predictor session approval for account:',
            predictorAddress
          );
        }
        return true;
      }
      // Fall through to try other verification methods
    }

    // Path 2: Try direct EOA verification
    try {
      const recoveredSigner = await recoverTypedDataAddress({
        ...typedData,
        signature,
      });

      if (recoveredSigner.toLowerCase() === predictorAddress.toLowerCase()) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[V2-Sig] Valid predictor EOA signature');
        }
        return true;
      }
    } catch {
      // EOA verification failed, continue to smart account check
    }

    // Path 3: Recover signer and verify they own the smart account
    const recoveredOwner = await recoverTypedDataAddress({
      ...typedData,
      signature,
    });

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner);

    if (expectedSmartAccount.toLowerCase() === predictorAddress.toLowerCase()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[V2-Sig] Valid predictor smart account owner signature, owner:',
          recoveredOwner
        );
      }
      return true;
    }

    console.warn(
      '[V2-Sig] Predictor signature verification failed: recovered signer does not match'
    );
    return false;
  } catch (error) {
    console.error('[V2-Sig] Predictor verification error:', error);
    return false;
  }
}

/**
 * Verifies the counterparty's EIP-712 signature for a V2 bid
 *
 * @param bid - The V2 bid payload
 * @param auction - The V2 auction request (to get picks and wagers)
 * @param verifyingContract - The PredictionMarketEscrow contract address
 * @returns true if signature is valid
 */
export async function verifyV2CounterpartySignature(
  bid: V2BidPayload,
  auction: V2AuctionRequestPayload,
  verifyingContract: Address
): Promise<boolean> {
  if (!bid.counterpartySignature) {
    return false;
  }

  try {
    const picks = convertPicks(auction.picks);

    // Build the typed data that should have been signed
    const rawTypedData = buildCounterpartyMintTypedData({
      picks,
      predictorWager: BigInt(auction.predictorWager),
      counterpartyWager: BigInt(auction.counterpartyWager),
      predictor: auction.predictor as Address,
      counterparty: bid.counterparty as Address,
      counterpartyNonce: BigInt(bid.counterpartyNonce),
      counterpartyDeadline: BigInt(bid.counterpartyDeadline),
      verifyingContract,
      chainId: auction.chainId,
    });

    // Convert chainId to number for viem
    const typedData = convertTypedDataForViem(rawTypedData);

    const counterpartyAddress = bid.counterparty.toLowerCase() as Address;
    const signature = bid.counterpartySignature as Hex;

    // Path 1: If session key data is present, verify via ZeroDev session
    if (bid.counterpartySessionKeyData) {
      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: bid.counterpartySessionKeyData,
        chainId: auction.chainId,
        typedData: undefined,
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        counterpartyAddress
      );

      if (sessionResult.valid && sessionResult.sessionKeyAddress) {
        const recoveredSigner = await recoverTypedDataAddress({
          ...typedData,
          signature,
        });

        if (
          recoveredSigner.toLowerCase() !==
          sessionResult.sessionKeyAddress.toLowerCase()
        ) {
          console.warn('[V2-Sig] Counterparty signature not from session key:', {
            expected: sessionResult.sessionKeyAddress,
            recovered: recoveredSigner,
          });
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[V2-Sig] Valid counterparty session approval for account:',
            counterpartyAddress
          );
        }
        return true;
      }
    }

    // Path 2: Try direct EOA verification
    try {
      const recoveredSigner = await recoverTypedDataAddress({
        ...typedData,
        signature,
      });

      if (recoveredSigner.toLowerCase() === counterpartyAddress.toLowerCase()) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[V2-Sig] Valid counterparty EOA signature');
        }
        return true;
      }
    } catch {
      // Continue to smart account check
    }

    // Path 3: Recover signer and verify they own the smart account
    const recoveredOwner = await recoverTypedDataAddress({
      ...typedData,
      signature,
    });

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner);

    if (expectedSmartAccount.toLowerCase() === counterpartyAddress.toLowerCase()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[V2-Sig] Valid counterparty smart account owner signature, owner:',
          recoveredOwner
        );
      }
      return true;
    }

    console.warn(
      '[V2-Sig] Counterparty signature verification failed: recovered signer does not match'
    );
    return false;
  } catch (error) {
    console.error('[V2-Sig] Counterparty verification error:', error);
    return false;
  }
}
