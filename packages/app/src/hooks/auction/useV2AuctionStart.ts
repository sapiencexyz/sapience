'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { buildPredictorMintTypedData } from '@sapience/sdk/auction/v2Signing';
import {
  computePickConfigId,
  canonicalizePicks,
} from '@sapience/sdk/auction/v2Encoding';
import type { Pick, V2AuctionRequestPayload } from '@sapience/sdk/types/v2';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { useV2Nonce } from '~/hooks/blockchain/useV2Contract';

export interface V2AuctionStartParams {
  /** Array of picks for this prediction */
  picks: Pick[];
  /** Predictor's wager amount in wei */
  predictorWager: bigint;
  /** Requested counterparty wager amount in wei */
  counterpartyWager: bigint;
  /** Deadline in seconds from now */
  deadlineSeconds?: number;
  /** Optional referral code */
  refCode?: Hex;
}

export interface V2AuctionStartResult {
  success: boolean;
  auctionId?: string;
  pickConfigId?: Hex;
  error?: string;
}

interface UseV2AuctionStartOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onAuctionCreated?: (auctionId: string, pickConfigId: Hex) => void;
}

export function useV2AuctionStart(options: UseV2AuctionStartOptions = {}) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onAuctionCreated,
  } = options;

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { apiBaseUrl } = useSettings();
  const { effectiveAddress } = useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get nonce for the predictor
  const { nonce: currentNonce, refetch: refetchNonce } = useV2Nonce({
    address: effectiveAddress as Address | undefined,
    chainId,
  });

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = predictionMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const startAuction = useCallback(
    async (params: V2AuctionStartParams): Promise<V2AuctionStartResult> => {
      const {
        picks: rawPicks,
        predictorWager,
        counterpartyWager,
        deadlineSeconds = 1800, // 30 minutes default
        refCode,
      } = params;

      // Use effectiveAddress from session context
      const signerAddress = effectiveAddress as Address | undefined;

      // Validation
      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!rawPicks || rawPicks.length === 0) {
        return { success: false, error: 'At least one pick is required' };
      }

      // Canonicalize picks for consistent pickConfigId and signatures
      const picks = canonicalizePicks(rawPicks);

      if (predictorWager <= 0n) {
        return { success: false, error: 'Invalid predictor wager amount' };
      }

      if (counterpartyWager <= 0n) {
        return { success: false, error: 'Invalid counterparty wager amount' };
      }

      if (!verifyingContract) {
        return {
          success: false,
          error: 'V2 contract not available for this chain',
        };
      }

      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
      }

      // Get nonce
      const nonce = currentNonce ?? 0n;

      // Calculate deadline
      const nowSec = Math.floor(Date.now() / 1000);
      const predictorDeadline = BigInt(nowSec + Math.max(60, deadlineSeconds));

      // Compute pickConfigId
      const pickConfigId = computePickConfigId(picks);

      // Build typed data for signing
      // Note: counterparty is unknown at auction start, use zero address
      const typedData = buildPredictorMintTypedData({
        picks,
        predictorWager,
        counterpartyWager,
        predictor: signerAddress,
        counterparty: '0x0000000000000000000000000000000000000000' as Address,
        predictorNonce: nonce,
        predictorDeadline,
        verifyingContract,
        chainId,
      });

      // Sign the typed data
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
        const error =
          e instanceof Error ? e : new Error(String(e?.message || e));
        onSignatureRejected?.(error);
        return {
          success: false,
          error: `Signature rejected: ${error.message}`,
        };
      }

      if (!predictorSignature) {
        setIsSubmitting(false);
        return { success: false, error: 'No signature returned' };
      }

      // Build V2 auction request payload
      const payload: V2AuctionRequestPayload = {
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorWager: predictorWager.toString(),
        counterpartyWager: counterpartyWager.toString(),
        predictor: signerAddress,
        predictorNonce: Number(nonce),
        predictorDeadline: Number(predictorDeadline),
        predictorSignature,
        chainId,
        refCode: refCode ?? undefined,
      };

      // Send V2 auction start message
      try {
        const client = getSharedAuctionWsClient(wsUrl);

        // Send and wait for ack
        const response = await new Promise<{
          auctionId?: string;
          error?: string;
        }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            removeListener();
            reject(new Error('Auction start timeout'));
          }, 10000);

          // Listen for ack using the proper API
          const removeListener = client.addMessageListener((msg: unknown) => {
            const data = msg as {
              type?: string;
              payload?: { auctionId?: string; error?: string };
            };
            if (data?.type === 'v2.auction.ack') {
              clearTimeout(timeout);
              removeListener();
              resolve(data.payload ?? {});
            }
          });

          // Debug logging for V2 auction signature debugging
          console.log(
            '[V2 Auction Create] picks:',
            picks.map((p) => ({
              resolver: p.conditionResolver,
              conditionId: p.conditionId.slice(0, 10) + '...',
              outcome: p.predictedOutcome,
            }))
          );
          console.log('[V2 Auction Create] pickConfigId:', pickConfigId);
          console.log(
            '[V2 Auction Create] predictorWager:',
            predictorWager.toString()
          );
          console.log(
            '[V2 Auction Create] counterpartyWager:',
            counterpartyWager.toString()
          );
          console.log('[V2 Auction Create] predictor:', signerAddress);
          console.log('[V2 Auction Create] predictorNonce:', nonce.toString());
          console.log(
            '[V2 Auction Create] predictorDeadline:',
            predictorDeadline.toString()
          );
          console.log('[V2 Auction Create] chainId:', chainId);

          client.send({ type: 'v2.auction.start', payload });
        });

        setIsSubmitting(false);

        if (response.error) {
          return { success: false, error: response.error };
        }

        if (response.auctionId) {
          onAuctionCreated?.(response.auctionId, pickConfigId);

          // Dispatch event for UI updates
          try {
            window.dispatchEvent(
              new CustomEvent('v2.auction.started', {
                detail: { auctionId: response.auctionId, pickConfigId },
              })
            );
          } catch {
            void 0;
          }

          return {
            success: true,
            auctionId: response.auctionId,
            pickConfigId,
          };
        }

        return { success: false, error: 'No auction ID returned' };
      } catch (e: any) {
        setIsSubmitting(false);
        return {
          success: false,
          error: `Failed to start auction: ${e?.message || 'Unknown error'}`,
        };
      }
    },
    [
      effectiveAddress,
      chainId,
      verifyingContract,
      wsUrl,
      currentNonce,
      signTypedDataAsync,
      onSignatureRejected,
      onAuctionCreated,
    ]
  );

  return {
    startAuction,
    isSubmitting,
    isConnected: Boolean(address),
    address: effectiveAddress as Address | undefined,
    chainId,
    verifyingContract,
    wsUrl,
    currentNonce,
    refetchNonce,
  };
}
