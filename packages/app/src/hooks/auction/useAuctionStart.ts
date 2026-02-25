'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { buildAuctionIntentTypedData } from '@sapience/sdk/auction/escrowSigning';
import {
  computePickConfigId,
  canonicalizePicks,
} from '@sapience/sdk/auction/escrowEncoding';
import type { Pick, AuctionRFQPayload } from '@sapience/sdk/types';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { generateRandomNonce } from '@sapience/sdk';

export interface AuctionStartParams {
  /** Array of picks for this prediction */
  picks: Pick[];
  /** Predictor's collateral amount in wei */
  predictorCollateral: bigint;
  /** Deadline in seconds from now */
  deadlineSeconds?: number;
  /** Optional referral code */
  refCode?: Hex;
}

export interface AuctionStartResult {
  success: boolean;
  auctionId?: string;
  pickConfigId?: Hex;
  error?: string;
}

interface UseAuctionStartOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onAuctionCreated?: (auctionId: string, pickConfigId: Hex) => void;
}

export function useAuctionStart(options: UseAuctionStartOptions = {}) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onAuctionCreated,
  } = options;

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { apiBaseUrl } = useSettings();
  const {
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    isUsingSession,
  } = useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = predictionMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const startAuction = useCallback(
    async (params: AuctionStartParams): Promise<AuctionStartResult> => {
      const {
        picks: rawPicks,
        predictorCollateral,
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

      if (predictorCollateral <= 0n) {
        return { success: false, error: 'Invalid predictor collateral amount' };
      }

      if (!verifyingContract) {
        return { success: false, error: 'Escrow contract not available for this chain' };
      }

      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
      }

      // Generate random nonce for bitmap nonce system (Permit2-style)
      const nonce = generateRandomNonce();

      // Calculate deadline
      const nowSec = Math.floor(Date.now() / 1000);
      const predictorDeadline = BigInt(nowSec + Math.max(60, deadlineSeconds));

      // Compute pickConfigId
      const pickConfigId = computePickConfigId(picks);

      // Two-step RFQ: sign lightweight AuctionIntent (proves identity + intent)
      // Does NOT commit to counterpartyCollateral or counterparty address.
      // The real MintApproval is signed in step 3 after receiving the vault's quote.
      const intentTypedData = buildAuctionIntentTypedData({
        picks,
        predictor: signerAddress,
        predictorCollateral,
        predictorNonce: nonce,
        predictorDeadline,
        verifyingContract,
        chainId,
      });

      setIsSubmitting(true);
      let intentSignature: Hex;
      try {
        // When session is active, sign with session key (no wallet popup)
        if (isUsingSession && sessionSignTypedData) {
          intentSignature = await sessionSignTypedData({
            domain: {
              ...intentTypedData.domain,
              chainId: Number(intentTypedData.domain.chainId),
            },
            types: intentTypedData.types,
            primaryType: intentTypedData.primaryType,
            message: intentTypedData.message as Record<string, unknown>,
          });
        } else {
          intentSignature = await signTypedDataAsync({
            domain: {
              ...intentTypedData.domain,
              chainId: Number(intentTypedData.domain.chainId),
            },
            types: intentTypedData.types,
            primaryType: intentTypedData.primaryType,
            message: intentTypedData.message,
          });
        }
      } catch (e: any) {
        setIsSubmitting(false);
        const error = e instanceof Error ? e : new Error(String(e?.message || e));
        onSignatureRejected?.(error);
        return { success: false, error: `Signature rejected: ${error.message}` };
      }

      if (!intentSignature) {
        setIsSubmitting(false);
        return { success: false, error: 'No signature returned' };
      }

      // Build RFQ payload with lightweight intent signature
      const payload: AuctionRFQPayload = {
        picks: picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: predictorCollateral.toString(),
        predictor: signerAddress,
        predictorNonce: Number(nonce),
        predictorDeadline: Number(predictorDeadline),
        intentSignature,
        chainId,
        refCode: refCode ?? undefined,
      };

      // Send auction start message
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
            if (data?.type === 'auction.ack') {
              clearTimeout(timeout);
              removeListener();
              resolve(data.payload ?? {});
            }
          });

          // Debug logging for auction signature debugging
          console.log(
            '[Auction Create] picks:',
            picks.map((p) => ({
              resolver: p.conditionResolver,
              conditionId: p.conditionId.slice(0, 10) + '...',
              outcome: p.predictedOutcome,
            }))
          );
          console.log('[Auction Create] pickConfigId:', pickConfigId);
          console.log(
            '[Auction Create] predictorCollateral:',
            predictorCollateral.toString()
          );
          console.log('[Auction Create] predictor:', signerAddress);
          console.log('[Auction Create] predictorNonce:', nonce.toString());
          console.log(
            '[Auction Create] predictorDeadline:',
            predictorDeadline.toString()
          );
          console.log('[Auction Create] chainId:', chainId);

          client.send({ type: 'auction.start', payload });
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
              new CustomEvent('auction.started', {
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
      signTypedDataAsync,
      sessionSignTypedData,
      isUsingSession,
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
  };
}
