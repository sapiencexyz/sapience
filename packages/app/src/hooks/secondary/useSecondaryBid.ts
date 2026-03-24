'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
import { erc20Abi, type Address, type Hex } from 'viem';
import { buildBuyerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import type { SecondaryBidPayload } from '@sapience/sdk/types/secondary';
import {
  secondaryMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { generateRandomNonce } from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { encodeEscrowSessionKeyData } from '~/lib/session/sessionKeyManager';

export interface SecondaryBidParams {
  /** Auction ID to bid on */
  auctionId: string;
  /** Position token address being sold */
  token: Address;
  /** Amount of position tokens (must match listing) */
  tokenAmount: bigint;
  /** Collateral price the buyer is offering */
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

  const walletChainId = useChainId();
  const chainId = overrideChainId ?? walletChainId;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    effectiveAddress,
    signTypedDataRaw: sessionSignTypedDataRaw,
    isUsingSession,
    tradeSessionKeyApproval,
  } = useSession();
  const { apiBaseUrl } = useSettings();

  // Use sapienceWriteContract for approval — routes through session key when active
  const { writeContract: sapienceWriteContract } = useSapienceWriteContract({
    disableSuccessToast: true,
    disableAutoRedirect: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = secondaryMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const collateralAddress = collateralToken[chainId]?.address as
    | Address
    | undefined;

  const publicClient = useMemo(
    () => getPublicClientForChainId(chainId),
    [chainId]
  );

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

      // Use Smart Account address when session is active, EOA otherwise
      const buyerAddress = isUsingSession ? effectiveAddress : address;

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

      // Check buyer's collateral allowance and approve if needed
      try {
        let currentAllowance = 0n;
        try {
          currentAllowance = await publicClient.readContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [buyerAddress, verifyingContract],
          });
        } catch {
          // Continue — will do approve
        }

        if (currentAllowance < price) {
          setIsSubmitting(true);
          await sapienceWriteContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [verifyingContract, price],
            chainId,
          });
        }
      } catch (e: unknown) {
        setIsSubmitting(false);
        return {
          success: false,
          error: `Collateral approval failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
        };
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
        if (isUsingSession && sessionSignTypedDataRaw) {
          // Session mode: raw ECDSA sign with session key (no kernel wrapping).
          // The contract does ECDSA.recover() so it needs a raw 65-byte signature.
          buyerSignature = await sessionSignTypedDataRaw({
            domain: {
              ...typedData.domain,
              chainId: Number(typedData.domain.chainId),
            },
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
        } else {
          // EOA mode: sign with wallet
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
      } catch (e: unknown) {
        setIsSubmitting(false);
        const error = e instanceof Error ? e : new Error(String(e));
        onSignatureRejected?.(error);
        return {
          success: false,
          error: `Signature rejected: ${error.message}`,
        };
      }

      // Build buyerSessionKeyData for on-chain session key verification
      let buyerSessionKeyData: string | undefined;
      if (isUsingSession && tradeSessionKeyApproval) {
        buyerSessionKeyData = encodeEscrowSessionKeyData(
          tradeSessionKeyApproval
        );
      }

      // Submit bid via WS
      const payload: SecondaryBidPayload = {
        auctionId,
        buyer: buyerAddress,
        price: price.toString(),
        buyerNonce: Number(nonce),
        buyerDeadline: Number(buyerDeadline),
        buyerSignature,
        buyerSessionKeyData,
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
      } catch (e: unknown) {
        setIsSubmitting(false);
        return {
          success: false,
          error: `Failed to submit bid: ${e instanceof Error ? e.message : 'Unknown error'}`,
        };
      }
    },
    [
      address,
      effectiveAddress,
      chainId,
      verifyingContract,
      collateralAddress,
      wsUrl,
      publicClient,
      sapienceWriteContract,
      signTypedDataAsync,
      sessionSignTypedDataRaw,
      isUsingSession,
      tradeSessionKeyApproval,
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
