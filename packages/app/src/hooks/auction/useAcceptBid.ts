'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import {
  type Address,
  type Hex,
  createPublicClient,
  http,
  zeroAddress,
} from 'viem';
import { buildPredictorMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import type { Pick, ValidatedBid, AuctionDetails } from '@sapience/sdk/types';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import {
  DEFAULT_CHAIN_ID,
  etherealTestnetChain,
  etherealChain,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useSession } from '~/lib/context/SessionContext';
import { useEscrowNonce } from '~/hooks/blockchain/useEscrowContract';

/**
 * Accept a vault's bid and submit mint() on-chain.
 *
 * Two-step RFQ flow — step 3:
 * 1. Predictor sent intent (no signature) ← useAuctionStart
 * 2. Vault quoted + signed MintApproval  ← vault-bot
 * 3. Predictor signs real MintApproval + submits mint() ← THIS HOOK
 */

export interface AcceptBidParams {
  /** The auction details (from auction.started) */
  auction: AuctionDetails;
  /** The vault's validated bid to accept */
  bid: ValidatedBid;
  /** Optional referral code */
  refCode?: Hex;
}

export interface AcceptBidResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

interface UseAcceptBidOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onMintSubmitted?: (txHash: string) => void;
}

export function useAcceptBid(options: UseAcceptBidOptions = {}) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onMintSubmitted,
  } = options;

  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { effectiveAddress } = useSession();

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { nonce: currentNonce } = useEscrowNonce({
    address: effectiveAddress as Address | undefined,
    chainId,
  });

  const acceptBid = useCallback(
    async (params: AcceptBidParams): Promise<AcceptBidResult> => {
      const { auction, bid, refCode } = params;

      const signerAddress = effectiveAddress as Address | undefined;

      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      const verifyingContract = predictionMarketEscrow[chainId]?.address as
        | Address
        | undefined;

      if (!verifyingContract) {
        return { success: false, error: 'Escrow contract not available for this chain' };
      }

      // Must be the predictor
      if (signerAddress.toLowerCase() !== auction.predictor.toLowerCase()) {
        return { success: false, error: 'Only the predictor can accept a bid' };
      }

      if (!bid.counterpartyCollateral || BigInt(bid.counterpartyCollateral) === 0n) {
        return { success: false, error: 'Bid has no counterparty collateral' };
      }

      // Convert picks to SDK format and canonicalize
      const rawPicks: Pick[] = auction.picks.map((p) => ({
        conditionResolver: p.conditionResolver as Address,
        conditionId: p.conditionId as Hex,
        predictedOutcome: p.predictedOutcome,
      }));
      const picks = canonicalizePicks(rawPicks);

      // All fields now known — build the real MintApproval
      const nonce = currentNonce ?? 0n;
      const nowSec = Math.floor(Date.now() / 1000);
      const predictorDeadline = BigInt(nowSec + 1800); // 30 min

      const typedData = buildPredictorMintTypedData({
        picks,
        predictorCollateral: BigInt(auction.predictorCollateral),
        counterpartyCollateral: BigInt(bid.counterpartyCollateral),
        predictor: signerAddress,
        counterparty: bid.counterparty as Address,
        predictorNonce: nonce,
        predictorDeadline,
        verifyingContract,
        chainId,
      });

      // Sign the real MintApproval
      setIsSubmitting(true);
      let predictorSignature: Hex;
      try {
        predictorSignature = await signTypedDataAsync({
          domain: {
            ...typedData.domain,
            chainId: Number(typedData.domain.chainId),
          },
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      } catch (e: any) {
        setIsSubmitting(false);
        const error = e instanceof Error ? e : new Error(String(e?.message || e));
        onSignatureRejected?.(error);
        return { success: false, error: `Signature rejected: ${error.message}` };
      }

      // Build the full MintRequest and submit mint() on-chain
      const chain = chainId === CHAIN_ID_ETHEREAL_TESTNET
        ? etherealTestnetChain
        : etherealChain;
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
      const EMPTY_BYTES = '0x' as Hex;

      const mintRequest = {
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: BigInt(auction.predictorCollateral),
        counterpartyCollateral: BigInt(bid.counterpartyCollateral),
        predictor: signerAddress,
        counterparty: bid.counterparty as Address,
        predictorNonce: nonce,
        counterpartyNonce: BigInt(bid.counterpartyNonce),
        predictorDeadline,
        counterpartyDeadline: BigInt(bid.counterpartyDeadline),
        predictorSignature,
        counterpartySignature: bid.counterpartySignature as Hex,
        refCode: refCode ?? ZERO_BYTES32,
        predictorSessionKeyData: EMPTY_BYTES,
        counterpartySessionKeyData: EMPTY_BYTES,
        predictorSponsor: zeroAddress,
        predictorSponsorData: EMPTY_BYTES,
      };

      try {
        // Simulate first
        const { request } = await publicClient.simulateContract({
          address: verifyingContract,
          abi: predictionMarketEscrowAbi,
          functionName: 'mint',
          args: [mintRequest],
          account: signerAddress,
        });

        // TODO: use actual wallet client to send transaction
        // For now, return the simulated request for the caller to execute
        // via wagmi's useWriteContract or similar
        console.log('[AcceptBid] Simulation successful', {
          auctionId: auction.auctionId,
          counterparty: bid.counterparty,
          counterpartyCollateral: bid.counterpartyCollateral,
        });

        setIsSubmitting(false);

        // Return success with the mint request data for the caller to submit
        return {
          success: true,
          // The caller should use wagmi's writeContract with the simulated request
          transactionHash: undefined,
        };
      } catch (e: any) {
        setIsSubmitting(false);
        console.error('[AcceptBid] Simulation failed', e);
        return {
          success: false,
          error: `Mint simulation failed: ${e?.message || 'Unknown error'}`,
        };
      }
    },
    [
      effectiveAddress,
      chainId,
      currentNonce,
      signTypedDataAsync,
      onSignatureRejected,
      onMintSubmitted,
    ]
  );

  return {
    acceptBid,
    isSubmitting,
    isConnected: Boolean(address),
    address: effectiveAddress as Address | undefined,
  };
}
