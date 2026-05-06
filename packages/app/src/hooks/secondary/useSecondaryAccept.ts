'use client';

import { useCallback, useMemo, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
import {
  encodeFunctionData,
  erc20Abi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { buildSellerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import {
  prepareExecuteTradeCalls,
  type ExecuteTradeParams,
} from '@sapience/sdk/onchain/secondaryTrade';
import {
  secondaryMarketEscrow,
  collateralToken,
} from '@sapience/sdk/contracts';
import { secondaryMarketEscrowAbi } from '@sapience/sdk/abis';
import { generateRandomNonce } from '@sapience/sdk';
import type { SecondaryValidatedBid } from '@sapience/sdk/types/secondary';
import { useSession } from '~/lib/context/SessionContext';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  isSessionInstalledOnChain,
  markSessionInstalledOnChain,
} from '~/lib/session/sessionKeyManager';

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
 * 1. Seller signs TradeApproval with session key (kernel-wrapped, ERC-1271)
 *    or EOA wallet
 * 2. Position token approve via owner signing (forceOwnerPath)
 * 3. executeTrade — contract validates the seller signature via the smart
 *    account's isValidSignature() (ERC-1271). sellerSessionKeyData is always
 *    sent as '0x' so the on-chain legacy session-key path is no longer used.
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
    sessionKeyAddress,
    chainClients,
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
  // Owner signing bypasses ZeroDev paymaster CallPolicy validation which
  // rejects session-key UserOps for executeTrade. The seller TradeApproval
  // signature itself is still produced by the session key (kernel-wrapped)
  // so the escrow validates it via ERC-1271 against the smart account.
  const { sendCalls, isPending: isTxPending } = useSapienceWriteContract({
    onSuccess: () => {
      setIsAccepting(false);
      onSuccess?.();
    },
    onError: (error) => {
      setIsAccepting(false);
      onError?.(error);
    },
    successMessage: undefined,
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
        // 0. Install the kernel permission validator if it has not been
        //    activated on this chain yet. The trade userOp itself is sent in
        //    sudo mode (owner-signed) to bypass the ZeroDev paymaster
        //    CallPolicy on `executeTrade`, but sudo userOps DO NOT install
        //    the validator. If no prior session-signed userOp has run, the
        //    contract's `isValidSignature` call against the seller will
        //    revert with `InvalidValidator()` and the trade fails. Send a
        //    no-op session-signed warmup (`revokeSessionKey(0x0)`) to force
        //    ENABLE-mode validator install.
        if (
          isUsingSession &&
          sessionKeyAddress &&
          chainClients.ethereal &&
          !isSessionInstalledOnChain(chainId, sessionKeyAddress)
        ) {
          try {
            const warmupHash = await chainClients.ethereal.sendUserOperation({
              calls: [
                {
                  to: escrowAddress,
                  data: encodeFunctionData({
                    abi: secondaryMarketEscrowAbi,
                    functionName: 'revokeSessionKey',
                    args: [zeroAddress],
                  }),
                  value: 0n,
                },
              ],
            });
            const warmupReceipt =
              await chainClients.ethereal.waitForUserOperationReceipt({
                hash: warmupHash,
              });
            if (!warmupReceipt.success) {
              throw new Error('Session install warmup userOp reverted');
            }
            markSessionInstalledOnChain(chainId, sessionKeyAddress);
          } catch (warmErr: unknown) {
            const error =
              warmErr instanceof Error ? warmErr : new Error(String(warmErr));
            Sentry.captureException(error, {
              tags: { component: 'secondary.session-warmup' },
              extra: { chainId, sessionKeyAddress },
            });
            setIsAccepting(false);
            onError?.(error);
            return {
              success: false,
              error: `Could not prepare session for trade: ${error.message}`,
            };
          }
        }

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
            // Session mode: kernel-wrapped signature. The escrow validates
            // it against the smart account via ERC-1271 (isValidSignature).
            sellerSignature = await sessionSignTypedData({
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
        } catch (e: unknown) {
          setIsAccepting(false);
          const error = e instanceof Error ? e : new Error(String(e));
          onSignatureRejected?.(error);
          return {
            success: false,
            error: `Signature rejected: ${error.message}`,
          };
        }

        // 2. Check position token allowance (used to decide if approve is needed in batch)
        let currentAllowance = 0n;
        try {
          currentAllowance = await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [sellerAddress, escrowAddress],
          });
        } catch {
          // Continue — will include approve in batch
        }

        // 3. Seller path no longer uses on-chain session-key data: the
        // signature above (kernel-wrapped when session is active) is verified
        // via ERC-1271. Buyer side is forwarded as received from the bid; if
        // a legacy client sent a non-empty blob we record telemetry so the
        // contract-side legacy path can be retired safely.
        const buyerSessionKeyData: Hex =
          (bid.buyerSessionKeyData as Hex | undefined) ?? '0x';
        if (buyerSessionKeyData !== '0x') {
          Sentry.addBreadcrumb({
            category: 'secondary.legacy_session_key',
            level: 'warning',
            message: 'accept_received_legacy_buyer_session_key_data',
            data: {
              auctionId: bid.auctionId,
              buyer: bid.buyer,
              byteLength: (buyerSessionKeyData.length - 2) / 2,
            },
          });
        }

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
          sellerSessionKeyData: '0x',
          buyerSessionKeyData,
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
      } catch (e: unknown) {
        setIsAccepting(false);
        const error = e instanceof Error ? e : new Error(String(e));
        onError?.(error);
        return {
          success: false,
          error: `Trade execution failed: ${error.message}`,
        };
      }
    },
    [
      address,
      effectiveAddress,
      chainId,
      escrowAddress,
      collateralAddress,
      publicClient,
      signTypedDataAsync,
      sessionSignTypedData,
      isUsingSession,
      sessionKeyAddress,
      chainClients.ethereal,
      sendCalls,
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
