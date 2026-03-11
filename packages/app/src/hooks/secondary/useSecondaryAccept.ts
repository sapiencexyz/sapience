'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
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
 * 1. Seller signs TradeApproval with session key (auto) or EOA wallet
 * 2. Position token approve via owner signing (forceOwnerPath — dynamic contract)
 * 3. executeTrade via session key with sellerSessionKeyData for on-chain verification
 */
export function useSecondaryAccept(options: UseSecondaryAcceptOptions = {}) {
  const {
    chainId: overrideChainId,
    onSuccess,
    onError,
    onSignatureRejected,
  } = options;

  const walletChainId = useChainId();
  const chainId = overrideChainId ?? walletChainId;
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

  // Both approve + executeTrade via owner signing in a single batch.
  // Owner signing bypasses ZeroDev paymaster CallPolicy validation
  // which rejects session key UserOps for executeTrade. The contract verifies signatures
  // internally using the sellerSessionKeyData/buyerSessionKeyData.
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
    forceOwnerPath: true,
  });

  const acceptBid = useCallback(
    async (params: AcceptBidParams): Promise<AcceptBidResult> => {
      const { token, tokenAmount, bid, refCode } = params;
      // Use Smart Account address when session is active, EOA otherwise
      const sellerAddress = isUsingSession ? effectiveAddress : address;

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
        // 1. Seller signs TradeApproval
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
            // Session mode: kernel-wrapped signing (EIP-1271 path).
            // The contract calls isValidSignature() on the smart account,
            // which validates via the kernel permission plugin. No separate
            // TRADE_PERMISSION approval needed — one signature at session creation.
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
            // EOA mode: sign with wallet
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

        // 2. Check position token allowance (used to decide if approve is needed in batch)
        let currentAllowance = 0n;
        try {
          currentAllowance = (await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [sellerAddress, escrowAddress],
          })) as bigint;
        } catch {
          // Continue — will include approve in batch
        }

        // 3. No sellerSessionKeyData needed — using EIP-1271 (Tier 2).
        // The kernel-wrapped signature is verified via isValidSignature()
        // on the smart account. sellerSessionKeyData stays empty ('0x').

        // 4. Build trade params
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
          refCode: refCode ?? (('0x' + '00'.repeat(32)) as Hex),
          sellerSessionKeyData: '0x' as Hex,
          buyerSessionKeyData: (bid.buyerSessionKeyData as Hex) ?? '0x',
        };

        // 5. Build approve (if needed) + executeTrade as a single batch
        const calls = prepareExecuteTradeCalls({
          trade: tradeParams,
          escrowAddress,
          currentSellerTokenAllowance: currentAllowance,
          approveFor: 'seller',
        });

        // 6. Submit batch via owner signing (one wallet prompt)
        await sendCalls({ calls, chainId });

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
