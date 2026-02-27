'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { buildSellerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import type { SecondaryAuctionRequestPayload } from '@sapience/sdk/types/secondary';
import {
  secondaryMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { generateRandomNonce } from '@sapience/sdk';

export interface SecondaryAuctionStartParams {
  token: Address;
  tokenAmount: bigint;
  minPrice: bigint;
  deadlineSeconds?: number;
  refCode?: Hex;
}

export interface SecondaryAuctionStartResult {
  success: boolean;
  auctionId?: string;
  error?: string;
}

interface UseSecondaryAuctionOptions {
  chainId?: number;
  onSignatureRejected?: (error: Error) => void;
  onAuctionCreated?: (auctionId: string) => void;
}

export function useSecondaryAuctionStart(
  options: UseSecondaryAuctionOptions = {}
) {
  const {
    chainId: overrideChainId,
    onSignatureRejected,
    onAuctionCreated,
  } = options;

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { apiBaseUrl } = useSettings();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = secondaryMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const collateralAddress = collateralToken[chainId]?.address as
    | Address
    | undefined;

  const startAuction = useCallback(
    async (
      params: SecondaryAuctionStartParams
    ): Promise<SecondaryAuctionStartResult> => {
      const {
        token,
        tokenAmount,
        minPrice,
        deadlineSeconds = 1800,
        refCode,
      } = params;

      if (!address) {
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
      if (tokenAmount <= 0n) {
        return { success: false, error: 'Invalid token amount' };
      }
      if (minPrice <= 0n) {
        return { success: false, error: 'Invalid minimum price' };
      }

      // Generate random nonce for bitmap nonce system (Permit2-style)
      const nonce = generateRandomNonce();
      const nowSec = Math.floor(Date.now() / 1000);
      const sellerDeadline = BigInt(nowSec + Math.max(60, deadlineSeconds));

      // Seller signs with buyer=address(0) — bots will fill
      const typedData = buildSellerTradeApproval({
        token,
        collateral: collateralAddress,
        seller: address,
        buyer: '0x0000000000000000000000000000000000000000' as Address,
        tokenAmount,
        price: minPrice,
        sellerNonce: nonce,
        sellerDeadline,
        verifyingContract,
        chainId,
      });

      setIsSubmitting(true);
      let sellerSignature: Hex;
      try {
        sellerSignature = await signTypedDataAsync({
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

      const payload: SecondaryAuctionRequestPayload = {
        token,
        collateral: collateralAddress,
        tokenAmount: tokenAmount.toString(),
        minPrice: minPrice.toString(),
        seller: address,
        sellerNonce: Number(nonce),
        sellerDeadline: Number(sellerDeadline),
        sellerSignature,
        chainId,
        refCode: refCode ?? undefined,
      };

      try {
        const client = getSharedAuctionWsClient(wsUrl);

        const response = await new Promise<{
          auctionId?: string;
          error?: string;
        }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            removeListener();
            reject(new Error('Auction start timeout'));
          }, 10000);

          const removeListener = client.addMessageListener((msg: unknown) => {
            const data = msg as {
              type?: string;
              payload?: { auctionId?: string; error?: string };
            };
            if (data?.type === 'secondary.auction.ack') {
              clearTimeout(timeout);
              removeListener();
              resolve(data.payload ?? {});
            }
          });

          client.send({
            type: 'secondary.auction.start',
            payload,
          });
        });

        setIsSubmitting(false);

        if (response.error) {
          return { success: false, error: response.error };
        }

        if (response.auctionId) {
          onAuctionCreated?.(response.auctionId);
          return { success: true, auctionId: response.auctionId };
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
      address,
      chainId,
      verifyingContract,
      collateralAddress,
      wsUrl,
      signTypedDataAsync,
      onSignatureRejected,
      onAuctionCreated,
    ]
  );

  return {
    startAuction,
    isSubmitting,
    isConnected: Boolean(address),
    address,
    chainId,
    verifyingContract,
  };
}
