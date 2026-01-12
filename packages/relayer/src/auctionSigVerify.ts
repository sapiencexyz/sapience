import {
  verifyMessage,
  recoverMessageAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  createAuctionStartSiweMessage,
  type AuctionStartSigningPayload,
} from '@sapience/sdk';
import { AuctionRequestPayload } from './types';
import { computeSmartAccountAddress } from './smartAccount';
import { verifySessionApproval, type SessionApprovalPayload } from './sessionAuth';

/**
 * Verifies the taker signature for an auction request.
 *
 * Verification flow:
 * 1. If sessionApproval is present: verify the ZeroDev session approval
 * 2. Try direct EOA verification (taker signed with their own key)
 * 3. If fails, assume smart account owner signed: recover signer, compute their smart account, verify match
 *
 * This approach:
 * - Requires no on-chain calls (fully deterministic)
 * - Works for EOAs, deployed smart accounts, and counterfactual smart accounts
 * - Supports ZeroDev session keys for smart account authentication
 *
 * @param payload - The auction request payload including the signature
 * @param domain - The domain that was used in the original message
 * @param uri - The URI that was used in the original message
 * @returns true if signature is valid, false otherwise
 */
export async function verifyAuctionSignature(
  payload: AuctionRequestPayload,
  domain: string,
  uri: string
): Promise<boolean> {
  if (!payload.takerSignature || !payload.takerSignedAt) {
    return false;
  }

  try {
    // Reconstruct the message that should have been signed
    const signingPayload: AuctionStartSigningPayload = {
      wager: payload.wager,
      predictedOutcomes: payload.predictedOutcomes,
      resolver: payload.resolver,
      taker: payload.taker,
      takerNonce: payload.takerNonce,
      chainId: payload.chainId,
    };
    const reconstructedMessage = createAuctionStartSiweMessage(
      signingPayload,
      domain,
      uri,
      payload.takerSignedAt
    );

    const takerAddress = payload.taker.toLowerCase() as Address;
    const signature = payload.takerSignature as Hex;

    // Path 1: If session approval is present, verify via ZeroDev session
    if (payload.sessionApproval) {
      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: payload.sessionApproval,
        chainId: payload.chainId,
        typedData: payload.sessionTypedData,
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        takerAddress
      );

      if (sessionResult.valid && sessionResult.sessionKeyAddress) {
        // Session approval is valid - now verify the request signature was signed by the session key
        // The session key is extracted from the cryptographically signed validatorData
        // This prevents attacks where someone intercepts session approval but doesn't have the session private key
        const recoveredSigner = await recoverMessageAddress({
          message: reconstructedMessage,
          signature,
        });

        if (recoveredSigner.toLowerCase() !== sessionResult.sessionKeyAddress.toLowerCase()) {
          console.warn('[Auction-Sig] Request signature not from session key:', {
            expected: sessionResult.sessionKeyAddress,
            recovered: recoveredSigner,
          });
          return false;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Auction-Sig] Valid session approval and signature for account:', takerAddress);
        }
        return true;
      } else {
        console.warn('[Auction-Sig] Session approval verification failed:', sessionResult.error);
        // Fall through to try other verification methods
      }
    }

    // Path 2: Try direct EOA verification
    try {
      const isValidEOA = await verifyMessage({
        address: takerAddress,
        message: reconstructedMessage,
        signature,
      });

      if (isValidEOA) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Auction-Sig] Valid EOA signature');
        }
        return true;
      }
    } catch {
      // EOA verification failed, continue to smart account check
    }

    // Path 3: Recover signer and verify they own the smart account
    const recoveredOwner = await recoverMessageAddress({
      message: reconstructedMessage,
      signature,
    });

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner);

    if (expectedSmartAccount.toLowerCase() === takerAddress.toLowerCase()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Auction-Sig] Valid smart account owner signature, owner:', recoveredOwner);
      }
      return true;
    }

    console.warn('[Auction-Sig] Signature verification failed: recovered owner does not match taker smart account');
    return false;
  } catch (error) {
    console.error('[Auction-Sig] Verification failed:', error);
    return false;
  }
}

/**
 * Helper to generate a message for the client to sign.
 * This can be used by clients to know what to sign.
 */
export function generateSigningMessage(
  payload: Omit<AuctionRequestPayload, 'takerSignature' | 'takerSignedAt' | 'sessionApproval'>,
  domain: string,
  uri: string,
  issuedAt?: string
): string {
  const signingPayload: AuctionStartSigningPayload = {
    wager: payload.wager,
    predictedOutcomes: payload.predictedOutcomes,
    resolver: payload.resolver,
    taker: payload.taker,
    takerNonce: payload.takerNonce,
    chainId: payload.chainId,
  };
  return createAuctionStartSiweMessage(
    signingPayload,
    domain,
    uri,
    issuedAt || new Date().toISOString()
  );
}
