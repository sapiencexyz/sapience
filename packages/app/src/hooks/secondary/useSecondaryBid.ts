'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { buildBuyerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import type { SecondaryBidPayload } from '@sapience/sdk/types/secondary';
import {
  secondaryMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { generateRandomNonce } from '@sapience/sdk';

export interface SecondaryBidParams {
  /** Auction ID to bid on */
  auctionId: string;
  /** Position token address being sold */
  token: Address;
  /** Amount of position tokens (must match listing) */
  tokenAmount: bigint;
  /** Collateral price the buyer is offering (>= listing minPrice) */
  price: bigint;
  /** Seller address (from the listing) */
  seller: Address;
  /** Bid validity in seconds (default 1800) */
  deadlineSeconds?: number;
}

export interface SecondaryBidResult {
  success: boolean;
  error?: string;
  buyerSignature?: Hex;
  buyerNonce?: bigint;
  buyerDeadline?: number;
}

interface UseSecondaryBidOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onBidSubmitted?: (auctionId: string) => void;
}

/**
 * Hook for buyers to submit bids on secondary market listings.
 * Signs a TradeApproval with the buyer's address and submits via WS.
 */
export function useSecondaryBid(options: UseSecondaryBidOptions = {}) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onBidSubmitted,
  } = options;

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    isUsingSession,
  } = useSession();
  const { apiBaseUrl } = useSettings();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = secondaryMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const collateralAddress = collateralToken[chainId]?.address as
    | Address
    | undefined;

  const submitBid = useCallback(
    async (params: SecondaryBidParams): Promise<SecondaryBidResult> => {
      const {
        auctionId,
        token,
        tokenAmount,
        price,
        seller,
        deadlineSeconds = 1800,
      } = params;

      const buyerAddress = effectiveAddress;

      if (!buyerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }
      if (!verifyingContract) {
        return {
          success: false,
          error: 'Secondary escrow not available for this chain',
        };
      }
      if (!collateralAddress) {
        return { success: false, error: 'Collateral token not configured' };
      }
      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
      }
      if (price <= 0n) {
        return { success: false, error: 'Price must be greater than 0' };
      }

      const nonce = generateRandomNonce();
      const nowSec = Math.floor(Date.now() / 1000);
      const buyerDeadline = BigInt(nowSec + Math.max(60, deadlineSeconds));

      // Build typed data for buyer's TradeApproval
      const typedData = buildBuyerTradeApproval({
        token,
        collateral: collateralAddress,
        seller,
        buyer: buyerAddress,
        tokenAmount,
        price,
        buyerNonce: nonce,
        buyerDeadline,
        verifyingContract,
        chainId,
      });

      setIsSubmitting(true);
      let buyerSignature: Hex;
      try {
        if (isUsingSession && sessionSignTypedData) {
          buyerSignature = await sessionSignTypedData({
            domain: {
              ...typedData.domain,
              chainId: Number(typedData.domain.chainId),
            },
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message as Record<string, unknown>,
          });
        } else {
          buyerSignature = await signTypedDataAsync({
            domain: {
              ...typedData.domain,
              chainId: Number(typedData.domain.chainId),
            },
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
        }
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

      // Submit bid via WS
      const payload: SecondaryBidPayload = {
        auctionId,
        buyer: buyerAddress,
        price: price.toString(),
        buyerNonce: Number(nonce),
        buyerDeadline: Number(buyerDeadline),
        buyerSignature,
      };

      try {
        const client = getSharedAuctionWsClient(wsUrl);
        client.send({ type: 'secondary.bid.submit', payload });
        setIsSubmitting(false);
        onBidSubmitted?.(auctionId);
        return {
          success: true,
          buyerSignature,
          buyerNonce: nonce,
          buyerDeadline: Number(buyerDeadline),
        };
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
      chainId,
      verifyingContract,
      collateralAddress,
      wsUrl,
      signTypedDataAsync,
      sessionSignTypedData,
      isUsingSession,
      onSignatureRejected,
      onBidSubmitted,
    ]
  );

  return {
    submitBid,
    isSubmitting,
    isConnected: Boolean(address),
    address: effectiveAddress,
    chainId,
    verifyingContract,
  };
}
