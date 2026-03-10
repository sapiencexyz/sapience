'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { erc20Abi, type Address, type Hex } from 'viem';
import { buildSellerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import {
  prepareExecuteTradeCalls,
  type ExecuteTradeParams,
} from '@sapience/sdk/onchain/secondaryTrade';
import {
  secondaryMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { generateRandomNonce } from '@sapience/sdk';
import { useSession } from '~/lib/context/SessionContext';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { getPublicClientForChainId } from '~/lib/utils/util';
import type { SecondaryValidatedBid } from '@sapience/sdk/types/secondary';

export interface AcceptBidParams {
  /** Position token address */
  token: Address;
  /** Amount of position tokens being sold (wei) */
  tokenAmount: bigint;
  /** The bid to accept */
  bid: SecondaryValidatedBid;
  /** Referral code (bytes32, 0x0 if none) */
  refCode?: Hex;
}

export interface AcceptBidResult {
  success: boolean;
  error?: string;
}

interface UseSecondaryAcceptOptions {
  chainId?: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onSignatureRejected?: (error: Error) => void;
}

/**
 * Hook for sellers to accept a bid on their secondary market listing.
 *
 * Flow:
 * 1. Seller re-signs TradeApproval with the actual buyer address
 * 2. Checks position token allowance → approve if needed
 * 3. Calls SecondaryMarketEscrow.executeTrade() with both signatures
 *
 * Same pattern as predictor calling mint() after accepting a counterparty bid.
 */
export function useSecondaryAccept(options: UseSecondaryAcceptOptions = {}) {
  const {
    chainId: overrideChainId,
    onSuccess,
    onError,
    onSignatureRejected,
  } = options;

  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    isUsingSession,
  } = useSession();

  const [isAccepting, setIsAccepting] = useState(false);

  const escrowAddress = secondaryMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const collateralAddress = collateralToken[chainId]?.address as
    | Address
    | undefined;

  const publicClient = useMemo(
    () => getPublicClientForChainId(chainId),
    [chainId]
  );

  const { sendCalls, isPending: isTxPending } = useSapienceWriteContract({
    onSuccess: () => {
      setIsAccepting(false);
      onSuccess?.();
    },
    onError: (error) => {
      setIsAccepting(false);
      onError?.(error);
    },
    successMessage: 'Secondary market trade executed successfully!',
    redirectPage: 'profile',
    redirectProfileAnchor: 'positions',
  });

  const acceptBid = useCallback(
    async (params: AcceptBidParams): Promise<AcceptBidResult> => {
      const { token, tokenAmount, bid, refCode } = params;
      const sellerAddress = effectiveAddress;

      if (!sellerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }
      if (!escrowAddress) {
        return {
          success: false,
          error: 'Secondary escrow not available for this chain',
        };
      }
      if (!collateralAddress) {
        return { success: false, error: 'Collateral token not configured' };
      }

      setIsAccepting(true);

      try {
        // 1. Seller re-signs with the actual buyer address
        const sellerNonce = generateRandomNonce();
        const nowSec = Math.floor(Date.now() / 1000);
        const sellerDeadline = BigInt(nowSec + 300); // 5 min to submit tx

        const typedData = buildSellerTradeApproval({
          token,
          collateral: collateralAddress,
          seller: sellerAddress,
          buyer: bid.buyer as Address,
          tokenAmount,
          price: BigInt(bid.price),
          sellerNonce,
          sellerDeadline,
          verifyingContract: escrowAddress,
          chainId,
        });

        let sellerSignature: Hex;
        try {
          if (isUsingSession && sessionSignTypedData) {
            sellerSignature = await sessionSignTypedData({
              domain: {
                ...typedData.domain,
                chainId: Number(typedData.domain.chainId),
              },
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message as Record<string, unknown>,
            });
          } else {
            sellerSignature = await signTypedDataAsync({
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
          setIsAccepting(false);
          const error =
            e instanceof Error ? e : new Error(String(e?.message || e));
          onSignatureRejected?.(error);
          return {
            success: false,
            error: `Signature rejected: ${error.message}`,
          };
        }

        // 2. Check current position token allowance
        let currentAllowance = 0n;
        try {
          currentAllowance = (await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [sellerAddress, escrowAddress],
          })) as bigint;
        } catch {
          // Continue — will include approve call
        }

        // 3. Build trade params
        const tradeParams: ExecuteTradeParams = {
          token,
          collateral: collateralAddress,
          seller: sellerAddress,
          buyer: bid.buyer as Address,
          tokenAmount,
          price: BigInt(bid.price),
          sellerNonce,
          buyerNonce: BigInt(bid.buyerNonce),
          sellerDeadline,
          buyerDeadline: BigInt(bid.buyerDeadline),
          sellerSignature,
          buyerSignature: bid.buyerSignature as Hex,
          refCode: refCode ?? ('0x' + '00'.repeat(32)) as Hex,
          buyerSessionKeyData: (bid.buyerSessionKeyData as Hex) ?? '0x',
        };

        // 4. Build batched calls (approve + executeTrade)
        const calls = prepareExecuteTradeCalls({
          trade: tradeParams,
          escrowAddress,
          currentSellerTokenAllowance: currentAllowance,
          approveFor: 'seller',
        });

        // 5. Submit via sendCalls (handles session keys, chain switching, etc.)
        await sendCalls({ calls });

        return { success: true };
      } catch (e: any) {
        setIsAccepting(false);
        const error =
          e instanceof Error ? e : new Error(String(e?.message || e));
        onError?.(error);
        return {
          success: false,
          error: `Trade execution failed: ${error.message}`,
        };
      }
    },
    [
      effectiveAddress,
      chainId,
      escrowAddress,
      collateralAddress,
      publicClient,
      signTypedDataAsync,
      sessionSignTypedData,
      isUsingSession,
      sendCalls,
      onSuccess,
      onError,
      onSignatureRejected,
    ]
  );

  return {
    acceptBid,
    isAccepting: isAccepting || isTxPending,
    isConnected: Boolean(address),
    address: effectiveAddress,
    chainId,
    escrowAddress,
  };
}
