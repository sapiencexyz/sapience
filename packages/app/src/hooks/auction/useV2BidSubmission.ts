'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import {
  type Address,
  type Hex,
  formatUnits,
  parseUnits,
  createPublicClient,
  http,
} from 'viem';
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/v2Signing';
import { canonicalizePicks } from '@sapience/sdk/auction/v2Encoding';
import type {
  Pick,
  V2BidPayload,
  V2AuctionDetails,
} from '@sapience/sdk/types/v2';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import {
  DEFAULT_CHAIN_ID,
  etherealTestnetChain,
  etherealChain,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';

export interface V2BidSubmissionParams {
  /** The auction to bid on */
  auction: V2AuctionDetails;
  /** Deadline in seconds from now */
  deadlineSeconds?: number;
}

export interface V2BidSubmissionResult {
  success: boolean;
  bidId?: string;
  error?: string;
}

interface UseV2BidSubmissionOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onBidSubmitted?: (bidId: string) => void;
}

export function useV2BidSubmission(options: UseV2BidSubmissionOptions = {}) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onBidSubmitted,
  } = options;

  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { apiBaseUrl } = useSettings();
  const { effectiveAddress } = useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  // Default to 18 decimals for formatting
  const tokenDecimals = 18;

  const formatAmount = useCallback(
    (weiAmount: bigint, decimals = tokenDecimals): string => {
      try {
        return formatUnits(weiAmount, decimals);
      } catch {
        return '0';
      }
    },
    [tokenDecimals]
  );

  const parseAmount = useCallback(
    (displayAmount: string, decimals = tokenDecimals): bigint => {
      try {
        return parseUnits(displayAmount, decimals);
      } catch {
        return 0n;
      }
    },
    [tokenDecimals]
  );

  const submitBid = useCallback(
    async (params: V2BidSubmissionParams): Promise<V2BidSubmissionResult> => {
      const { auction, deadlineSeconds = 1800 } = params; // 30 minutes default

      const chainId = auction.chainId ?? overrideChainId ?? DEFAULT_CHAIN_ID;

      // Use effectiveAddress from session context
      const signerAddress = effectiveAddress as Address | undefined;

      // Validation
      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!auction.auctionId) {
        return { success: false, error: 'Auction ID required' };
      }

      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
      }

      const verifyingContract = predictionMarketEscrow[chainId]?.address as
        | Address
        | undefined;

      if (!verifyingContract) {
        return {
          success: false,
          error: 'V2 contract not available for this chain',
        };
      }

      // Cannot bid on own auction
      if (signerAddress.toLowerCase() === auction.predictor.toLowerCase()) {
        return { success: false, error: 'Cannot bid on your own auction' };
      }

      // Get nonce for the counterparty (this signer) from the contract
      const chain =
        chainId === CHAIN_ID_ETHEREAL_TESTNET
          ? etherealTestnetChain
          : etherealChain;
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      let counterpartyNonce: bigint;
      try {
        const nonceResult = await publicClient.readContract({
          address: verifyingContract,
          abi: predictionMarketEscrowAbi,
          functionName: 'getNonce',
          args: [signerAddress],
        });
        counterpartyNonce = BigInt(nonceResult as string | number | bigint);
        console.log(
          '[V2 Bid] Fetched counterparty nonce from contract:',
          counterpartyNonce.toString()
        );
      } catch (nonceError) {
        console.error(
          '[V2 Bid] Failed to fetch nonce, defaulting to 0:',
          nonceError
        );
        counterpartyNonce = 0n;
      }

      const client = getSharedAuctionWsClient(wsUrl);

      // Calculate deadline
      const nowSec = Math.floor(Date.now() / 1000);
      const counterpartyDeadline = BigInt(
        nowSec + Math.max(60, deadlineSeconds)
      );

      // Convert picks from JSON to SDK format and canonicalize
      const rawPicks: Pick[] = auction.picks.map((p) => ({
        conditionResolver: p.conditionResolver as Address,
        conditionId: p.conditionId as Hex,
        predictedOutcome: p.predictedOutcome,
      }));
      const picks = canonicalizePicks(rawPicks);

      // Build typed data for counterparty signature
      const typedData = buildCounterpartyMintTypedData({
        picks,
        predictorWager: BigInt(auction.predictorWager),
        counterpartyWager: BigInt(auction.counterpartyWager),
        predictor: auction.predictor as Address,
        counterparty: signerAddress,
        counterpartyNonce,
        counterpartyDeadline,
        verifyingContract,
        chainId,
      });

      // Sign the typed data
      setIsSubmitting(true);
      let counterpartySignature: Hex;
      try {
        counterpartySignature = await signTypedDataAsync({
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
        const error =
          e instanceof Error ? e : new Error(String(e?.message || e));
        onSignatureRejected?.(error);
        return {
          success: false,
          error: `Signature rejected: ${error.message}`,
        };
      }

      if (!counterpartySignature) {
        setIsSubmitting(false);
        return { success: false, error: 'No signature returned' };
      }

      // Build V2 bid payload
      const bidPayload: V2BidPayload = {
        auctionId: auction.auctionId,
        counterparty: signerAddress,
        counterpartyWager: auction.counterpartyWager,
        counterpartyNonce: Number(counterpartyNonce),
        counterpartyDeadline: Number(counterpartyDeadline),
        counterpartySignature,
      };

      // Send V2 bid submit message
      try {
        const response = await new Promise<{ bidId?: string; error?: string }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              removeListener();
              reject(new Error('Bid submission timeout'));
            }, 10000);

            // Listen for ack using the proper API
            const removeListener = client.addMessageListener((msg: unknown) => {
              const data = msg as {
                type?: string;
                payload?: { bidId?: string; error?: string };
              };
              if (data?.type === 'v2.bid.ack') {
                clearTimeout(timeout);
                removeListener();
                resolve(data.payload ?? {});
              }
            });

            client.send({ type: 'v2.bid.submit', payload: bidPayload });
          }
        );

        setIsSubmitting(false);

        if (response.error) {
          return { success: false, error: response.error };
        }

        if (response.bidId || !response.error) {
          const bidId =
            response.bidId ??
            `${auction.auctionId}-${signerAddress.slice(0, 8)}`;
          onBidSubmitted?.(bidId);

          // Dispatch event for UI updates
          try {
            window.dispatchEvent(
              new CustomEvent('v2.bid.submitted', {
                detail: { auctionId: auction.auctionId, bidId },
              })
            );
          } catch {
            void 0;
          }

          return { success: true, bidId };
        }

        return { success: false, error: 'Failed to submit bid' };
      } catch (e: any) {
        setIsSubmitting(false);
        return {
          success: false,
          error: `Failed to submit bid: ${e?.message || 'Unknown error'}`,
        };
      }
    },
    [
      effectiveAddress,
      overrideChainId,
      wsUrl,
      signTypedDataAsync,
      onSignatureRejected,
      onBidSubmitted,
    ]
  );

  return {
    submitBid,
    isSubmitting,
    isConnected: Boolean(address),
    address: effectiveAddress as Address | undefined,
    wsUrl,
    tokenDecimals,
    formatAmount,
    parseAmount,
  };
}
