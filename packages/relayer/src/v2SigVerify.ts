/**
 * V2 Signature Verification
 * Verifies EIP-712 typed data signatures for V2 predictions
 */

import {
  recoverTypedDataAddress,
  decodeAbiParameters,
  hashTypedData,
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
 * Decoded V2 SessionKeyData struct from ABI-encoded bytes
 */
interface DecodedV2SessionKeyData {
  sessionKey: Address;
  owner: Address;
  validUntil: bigint;
  permissionsHash: Hex;
  chainId: bigint;
  ownerSignature: Hex;
}

/**
 * Decode V2 SessionKeyData from ABI-encoded hex bytes
 * The data has a 32-byte offset pointer prefix followed by the struct fields
 */
function decodeV2SessionKeyData(data: string): DecodedV2SessionKeyData | null {
  try {
    // V2 ABI-encoded data starts with 0x and has offset pointer
    if (!data.startsWith('0x') || data.length < 66) {
      return null;
    }

    // Skip the 32-byte offset pointer (0x + 64 hex chars = first 66 chars)
    const structData = ('0x' + data.slice(66)) as Hex;

    // Decode the struct fields
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
    console.debug('[V2-Sig] Failed to decode V2 session key data:', e);
    return null;
  }
}

/**
 * Verify V2 SessionKeyData by checking the owner's signature on the SessionKeyApproval
 */
async function verifyV2SessionKeyData(
  sessionKeyData: DecodedV2SessionKeyData,
  smartAccount: Address,
  verifyingContract: Address
): Promise<{ valid: boolean; sessionKeyAddress?: Address }> {
  try {
    // Build the SessionKeyApproval typed data that the owner signed
    const typedData = {
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
    };

    // Recover the signer from the owner's signature
    const recoveredOwner = await recoverTypedDataAddress({
      ...typedData,
      signature: sessionKeyData.ownerSignature,
    });

    // Verify the recovered signer is the declared owner
    if (recoveredOwner.toLowerCase() !== sessionKeyData.owner.toLowerCase()) {
      console.warn('[V2-Sig] Owner signature invalid:', {
        expected: sessionKeyData.owner,
        recovered: recoveredOwner,
      });
      return { valid: false };
    }

    // Verify the session is not expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Number(sessionKeyData.validUntil) < nowSeconds) {
      console.warn('[V2-Sig] Session expired:', {
        validUntil: Number(sessionKeyData.validUntil),
        now: nowSeconds,
      });
      return { valid: false };
    }

    // Optionally verify smart account is derived from owner
    // (Skip for now - contract will validate this)

    console.debug('[V2-Sig] V2 session key data verified:', {
      sessionKey: sessionKeyData.sessionKey,
      owner: sessionKeyData.owner,
      smartAccount,
    });

    return { valid: true, sessionKeyAddress: sessionKeyData.sessionKey };
  } catch (e) {
    console.error('[V2-Sig] V2 session key verification error:', e);
    return { valid: false };
  }
}

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
    // counterpartyWager comes from the bid (counterparty decides their wager)
    const rawTypedData = buildCounterpartyMintTypedData({
      picks,
      predictorWager: BigInt(auction.predictorWager),
      counterpartyWager: BigInt(bid.counterpartyWager),
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

    // Path 1: If session key data is present, try to verify
    if (bid.counterpartySessionKeyData) {
      // Path 1a: Try V2 ABI-encoded format (hex starting with 0x)
      const v2SessionData = decodeV2SessionKeyData(bid.counterpartySessionKeyData);
      if (v2SessionData) {
        const v2Result = await verifyV2SessionKeyData(
          v2SessionData,
          counterpartyAddress,
          verifyingContract
        );

        if (v2Result.valid && v2Result.sessionKeyAddress) {
          const recoveredSigner = await recoverTypedDataAddress({
            ...typedData,
            signature,
          });

          if (
            recoveredSigner.toLowerCase() !==
            v2Result.sessionKeyAddress.toLowerCase()
          ) {
            console.warn('[V2-Sig] Counterparty signature not from V2 session key:', {
              expected: v2Result.sessionKeyAddress,
              recovered: recoveredSigner,
            });
            return false;
          }

          console.debug(
            '[V2-Sig] Valid counterparty V2 session approval for account:',
            counterpartyAddress
          );
          return true;
        }
      }

      // Path 1b: Try ZeroDev format (base64 JSON)
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
          console.warn('[V2-Sig] Counterparty signature not from ZeroDev session key:', {
            expected: sessionResult.sessionKeyAddress,
            recovered: recoveredSigner,
          });
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[V2-Sig] Valid counterparty ZeroDev session approval for account:',
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
