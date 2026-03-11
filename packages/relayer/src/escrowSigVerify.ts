/**
 * Escrow Signature Verification
 * Verifies EIP-712 typed data signatures for escrow predictions
 */

import {
  recoverTypedDataAddress,
  decodeAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import {
  buildCounterpartyMintTypedData,
} from '@sapience/sdk/auction/escrowSigning';
import type { Pick } from '@sapience/sdk/types';
import type { AuctionRFQPayload, BidPayload } from './escrowTypes';
import {
  verifySessionApproval,
  computeSmartAccountAddress,
  type SessionApprovalPayload,
} from './sessionAuth';

/**
 * Decoded Escrow SessionKeyData struct from ABI-encoded bytes
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
 * Decode Escrow SessionKeyData from ABI-encoded hex bytes
 * The data has a 32-byte offset pointer prefix followed by the struct fields
 */
function decodeEscrowSessionKeyData(data: string): DecodedEscrowSessionKeyData | null {
  try {
    // ABI-encoded data starts with 0x and has offset pointer
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
    console.debug('[Escrow-Sig] Failed to decode escrow session key data:', e);
    return null;
  }
}

/**
 * Verify Escrow SessionKeyData by checking the owner's signature on the SessionKeyApproval
 */
async function verifyEscrowSessionKeyData(
  sessionKeyData: DecodedEscrowSessionKeyData,
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
      console.warn('[Escrow-Sig] Owner signature invalid:', {
        expected: sessionKeyData.owner,
        recovered: recoveredOwner,
      });
      return { valid: false };
    }

    // Verify the session is not expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Number(sessionKeyData.validUntil) < nowSeconds) {
      console.warn('[Escrow-Sig] Session expired:', {
        validUntil: Number(sessionKeyData.validUntil),
        now: nowSeconds,
      });
      return { valid: false };
    }

    // Optionally verify smart account is derived from owner
    // (Skip for now - contract will validate this)

    console.debug('[Escrow-Sig] Escrow session key data verified:', {
      sessionKey: sessionKeyData.sessionKey,
      owner: sessionKeyData.owner,
      smartAccount,
    });

    return { valid: true, sessionKeyAddress: sessionKeyData.sessionKey };
  } catch (e) {
    console.error('[Escrow-Sig] Escrow session key verification error:', e);
    return { valid: false };
  }
}

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

  try {
    const picks = convertPicks(auction.picks);

    // Build the typed data that should have been signed
    // counterpartyCollateral comes from the bid (counterparty decides their wager)
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

    // Convert chainId to number for viem
    const typedData = convertTypedDataForViem(rawTypedData);

    const counterpartyAddress = bid.counterparty.toLowerCase() as Address;
    const signature = bid.counterpartySignature as Hex;

    // Path 1: If session key data is present, try to verify
    if (bid.counterpartySessionKeyData) {
      // Path 1a: Try ABI-encoded format (hex starting with 0x)
      const escrowSessionData = decodeEscrowSessionKeyData(bid.counterpartySessionKeyData);
      if (escrowSessionData) {
        const escrowResult = await verifyEscrowSessionKeyData(
          escrowSessionData,
          counterpartyAddress,
          verifyingContract
        );

        if (escrowResult.valid && escrowResult.sessionKeyAddress) {
          const recoveredSigner = await recoverTypedDataAddress({
            ...typedData,
            signature,
          });

          if (
            recoveredSigner.toLowerCase() !==
            escrowResult.sessionKeyAddress.toLowerCase()
          ) {
            console.warn('[Escrow-Sig] Counterparty signature not from escrow session key:', {
              expected: escrowResult.sessionKeyAddress,
              recovered: recoveredSigner,
            });
            return false;
          }

          console.debug(
            '[Escrow-Sig] Valid counterparty escrow session approval for account:',
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
          console.warn('[Escrow-Sig] Counterparty signature not from ZeroDev session key:', {
            expected: sessionResult.sessionKeyAddress,
            recovered: recoveredSigner,
          });
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[Escrow-Sig] Valid counterparty ZeroDev session approval for account:',
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
          console.debug('[Escrow-Sig] Valid counterparty EOA signature');
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

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner, auction.chainId);

    if (expectedSmartAccount.toLowerCase() === counterpartyAddress.toLowerCase()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[Escrow-Sig] Valid counterparty smart account owner signature, owner:',
          recoveredOwner
        );
      }
      return true;
    }

    console.warn(
      '[Escrow-Sig] Counterparty signature verification failed: recovered signer does not match'
    );
    return false;
  } catch (error) {
    console.error('[Escrow-Sig] Counterparty verification error:', error);
    return false;
  }
}

// ============================================================================
// Auction Intent Verification (RFQ lightweight auth)
// ============================================================================

/**
 * Verify the predictor's AuctionIntent signature at RFQ start.
 * Relayer-only — proves identity + intent without committing to counterparty details.
 * Supports EOA, escrow session keys, and ZeroDev smart accounts.
 */
export async function verifyAuctionIntentSignature(
  payload: AuctionRFQPayload,
  verifyingContract: Address
): Promise<boolean> {
  if (!payload.intentSignature) {
    return false;
  }

  try {
    const picks = convertPicks(payload.picks);

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

    const predictorAddress = payload.predictor.toLowerCase() as Address;
    const signature = payload.intentSignature as Hex;

    // Path 1: If session key data is present, try to verify
    if (payload.predictorSessionKeyData) {
      // Path 1a: Try ABI-encoded format (hex starting with 0x)
      const escrowSessionData = decodeEscrowSessionKeyData(
        payload.predictorSessionKeyData
      );
      if (escrowSessionData) {
        const escrowResult = await verifyEscrowSessionKeyData(
          escrowSessionData,
          predictorAddress,
          verifyingContract
        );

        if (escrowResult.valid && escrowResult.sessionKeyAddress) {
          const recoveredSigner = await recoverTypedDataAddress({
            ...typedData,
            signature,
          });

          if (
            recoveredSigner.toLowerCase() !==
            escrowResult.sessionKeyAddress.toLowerCase()
          ) {
            console.warn(
              '[Escrow-Sig] Intent signature not from escrow session key:',
              {
                expected: escrowResult.sessionKeyAddress,
                recovered: recoveredSigner,
              }
            );
            return false;
          }

          console.debug(
            '[Escrow-Sig] Valid predictor intent escrow session approval for account:',
            predictorAddress
          );
          return true;
        }
      }

      // Path 1b: Try ZeroDev format (base64 JSON)
      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: payload.predictorSessionKeyData,
        chainId: payload.chainId,
        typedData: undefined,
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        predictorAddress
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
          console.warn(
            '[Escrow-Sig] Intent signature not from ZeroDev session key:',
            {
              expected: sessionResult.sessionKeyAddress,
              recovered: recoveredSigner,
            }
          );
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            '[Escrow-Sig] Valid predictor intent ZeroDev session approval for account:',
            predictorAddress
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

      if (recoveredSigner.toLowerCase() === predictorAddress) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Escrow-Sig] Valid predictor intent EOA signature');
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

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner, payload.chainId);

    if (expectedSmartAccount.toLowerCase() === predictorAddress) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[Escrow-Sig] Valid predictor intent smart account owner signature, owner:',
          recoveredOwner
        );
      }
      return true;
    }

    console.warn(
      '[Escrow-Sig] Intent signature verification failed: recovered signer does not match'
    );
    return false;
  } catch (error) {
    console.error('[Escrow-Sig] Intent verification error:', error);
    return false;
  }
}
