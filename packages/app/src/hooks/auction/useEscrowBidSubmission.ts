'use client';

/**
 * Escrow bid submission hook.
 * Uses MintApproval EIP-712 format from PredictionMarketEscrow.
 */
import { useCallback, useMemo } from 'react';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
import { parseUnits, formatUnits, zeroAddress, type Address } from 'viem';
import {
  predictionMarketEscrow,
  collateralToken as collateralTokenAddresses,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { erc20Abi, encodeFunctionData, parseAbi } from 'viem';

// wUSDe ABI for deposit function (wraps native USDe to wUSDe)
const WUSDE_DEPOSIT_ABI = parseAbi(['function deposit() payable']);
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import type { OutcomeSide } from '@sapience/sdk';
import { type Pick as EscrowPick } from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { generateRandomNonce } from '@sapience/sdk';
import { validateCounterpartyFunds } from '@sapience/sdk/onchain/position';

export type EscrowBidSubmissionParams = {
  auctionId: string;
  /** Counterparty's (bidder's) position size in wei */
  counterpartyCollateral: bigint;
  /** Predictor's (auction creator's) position size in wei */
  predictorCollateral: bigint;
  /** Predictor (auction creator) address */
  predictor: `0x${string}`;
  /** Bid expiry in seconds from now */
  expirySeconds: number;
  /** Optional max end time (seconds since epoch) to clamp expiry */
  maxEndTimeSec?: number;
  /** Picks for signing — each pick has its own conditionResolver */
  picks: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
};

export type EscrowBidSubmissionResult = {
  success: boolean;
  error?: string;
  /** The signature if successful */
  signature?: `0x${string}`;
  /** The counterparty deadline used */
  counterpartyDeadline?: number;
};

interface UseBidSubmissionOptions {
  /** Called when signature is rejected by user */
  onSignatureRejected?: (error: Error) => void;
}

interface UseEscrowBidSubmissionResult {
  /** Submit a bid with signing and WebSocket transmission */
  submitBid: (
    params: EscrowBidSubmissionParams
  ) => Promise<EscrowBidSubmissionResult>;
  /** Whether the wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: `0x${string}` | undefined;
  /** Current chain ID */
  chainId: number;
  /** WebSocket URL for auction */
  wsUrl: string | null;
  /** Verifying contract address */
  verifyingContract: `0x${string}` | undefined;
  /** Token decimals for formatting */
  tokenDecimals: number;
  /** Format a wei amount to display units */
  formatAmount: (weiAmount: bigint, decimals?: number) => string;
  /** Parse a display amount to wei */
  parseAmount: (displayAmount: string, decimals?: number) => bigint;
}

export function useEscrowBidSubmission(
  options: UseBidSubmissionOptions = {}
): UseEscrowBidSubmissionResult {
  const { onSignatureRejected } = options;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const walletChainId = useChainId();
  const chainId = walletChainId ?? DEFAULT_CHAIN_ID;
  const { apiBaseUrl } = useSettings();
  const {
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    isUsingSession,
    isUsingSmartAccount,
    chainClients,
  } = useSession();
  const { toast } = useToast();

  // Get wUSDe contract address for the chain
  const wusdeAddress = collateralTokenAddresses[chainId]?.address as
    | Address
    | undefined;

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = predictionMarketEscrow[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Note: escrow nonces are now generated randomly per-request (bitmap nonce system)

  // Default to 18 decimals, can be overridden in format/parse calls
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
    async (
      params: EscrowBidSubmissionParams
    ): Promise<EscrowBidSubmissionResult> => {
      const {
        auctionId,
        counterpartyCollateral,
        predictorCollateral,
        predictor,
        expirySeconds,
        maxEndTimeSec,
        picks: escrowPicks,
      } = params;

      // Use effectiveAddress from session context (smart account when session active, otherwise EOA)
      const signerAddress = effectiveAddress;

      // Validate required data
      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!auctionId) {
        return { success: false, error: 'Auction ID required' };
      }

      if (counterpartyCollateral <= 0n) {
        return { success: false, error: 'Invalid bid amount' };
      }

      if (!escrowPicks || escrowPicks.length === 0) {
        return { success: false, error: 'Missing picks' };
      }

      if (!predictor) {
        return { success: false, error: 'Missing predictor address' };
      }

      if (!verifyingContract) {
        return { success: false, error: 'Missing verifying contract' };
      }

      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
      }

      // Best-effort check — predictor may batch approval with the mint tx,
      // so insufficient allowance here is expected and should not block the bid.
      try {
        const publicClient = getPublicClientForChainId(chainId);
        await validateCounterpartyFunds(
          predictor,
          predictorCollateral,
          wusdeAddress ?? zeroAddress,
          verifyingContract,
          publicClient
        );
      } catch {
        // Don't block — predictor funds are verified on-chain at settlement
      }

      // Calculate deadline with optional clamping
      const nowSec = Math.floor(Date.now() / 1000);
      const requested = Math.max(0, expirySeconds);
      const clampedExpiry = (() => {
        const end = Number(maxEndTimeSec || 0);
        if (!Number.isFinite(end) || end <= 0) return requested;
        const remaining = Math.max(0, end - nowSec);
        return Math.min(requested, remaining);
      })();
      const counterpartyDeadline = nowSec + clampedExpiry;

      let counterpartySignature: `0x${string}`;

      // Generate random nonce for bitmap nonce system (Permit2-style)
      const counterpartyNonce = generateRandomNonce();

      {
        // Escrow: SmartAccount counterparties need wUSDe pre-funded before mint
        // The predictor calls mint(), which does transferFrom(counterparty) - counterparty can't wrap at that time
        if (isUsingSession && wusdeAddress && chainClients?.ethereal) {
          const escrowAddress = verifyingContract;
          const publicClient = getPublicClientForChainId(chainId);

          try {
            // Check counterparty's current wUSDe state
            const [wusdeBalance, wusdeAllowance] = await Promise.all([
              publicClient.readContract({
                address: wusdeAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [signerAddress],
              }),
              publicClient.readContract({
                address: wusdeAddress,
                abi: erc20Abi,
                functionName: 'allowance',
                args: [signerAddress, escrowAddress],
              }),
            ]);

            const needsMoreWusde = wusdeBalance < counterpartyCollateral;
            const needsMoreAllowance = wusdeAllowance < counterpartyCollateral;

            if (needsMoreWusde || needsMoreAllowance) {
              // Check native USDe balance for potential wrapping
              const nativeUsdeBalance = await publicClient.getBalance({
                address: signerAddress,
              });

              // wUSDe.deposit() wraps native USDe sent as msg.value
              const wrapAmount = needsMoreWusde
                ? counterpartyCollateral - wusdeBalance
                : 0n;

              if (wrapAmount > 0n && nativeUsdeBalance < wrapAmount) {
                return {
                  success: false,
                  error: `Insufficient USDe in SmartAccount. Need ${formatAmount(wrapAmount)} more USDe. Please transfer from your wallet.`,
                };
              }

              // Build calls for wrap and/or approve
              const calls: Array<{
                to: Address;
                data: `0x${string}`;
                value: bigint;
              }> = [];

              if (wrapAmount > 0n) {
                // Wrap native USDe to wUSDe via deposit()
                calls.push({
                  to: wusdeAddress,
                  data: encodeFunctionData({
                    abi: WUSDE_DEPOSIT_ABI,
                    functionName: 'deposit',
                  }),
                  value: wrapAmount,
                });
              }

              if (needsMoreAllowance) {
                // Approve escrow to spend wUSDe
                calls.push({
                  to: wusdeAddress,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [escrowAddress, counterpartyCollateral],
                  }),
                  value: 0n,
                });
              }

              if (calls.length > 0) {
                try {
                  // Execute wrap + approve via session key
                  const userOpHash =
                    await chainClients.ethereal.sendUserOperation({
                      calls,
                    });

                  // Wait for the UserOp to be included
                  const receipt =
                    await chainClients.ethereal.waitForUserOperationReceipt({
                      hash: userOpHash,
                    });

                  if (!receipt.success) {
                    return {
                      success: false,
                      error:
                        'Failed to prepare funds for bid. Please try again.',
                    };
                  }
                } catch (prepError) {
                  console.error(
                    '[Escrow Bid] Fund preparation failed:',
                    prepError
                  );
                  return {
                    success: false,
                    error: `Failed to prepare funds: ${prepError instanceof Error ? prepError.message : String(prepError)}`,
                  };
                }
              }
            }
          } catch (checkError) {
            console.warn(
              '[Escrow Bid] Failed to check counterparty funds:',
              checkError
            );
            // Continue with bid - validation will catch issues later
          }
        }

        // Escrow signing: Use MintApproval typed data
        const picks: EscrowPick[] = escrowPicks.map((p) => ({
          conditionResolver: p.conditionResolver as `0x${string}`,
          conditionId: p.conditionId as `0x${string}`,
          predictedOutcome: p.predictedOutcome as OutcomeSide,
        }));

        // Build escrow typed data for counterparty (bidder)
        const typedData = buildCounterpartyMintTypedData({
          picks,
          predictorCollateral,
          counterpartyCollateral,
          predictor,
          counterparty: signerAddress,
          counterpartyNonce,
          counterpartyDeadline: BigInt(counterpartyDeadline),
          predictorSponsor: '0x0000000000000000000000000000000000000000',
          predictorSponsorData: '0x',
          verifyingContract: verifyingContract,
          chainId,
        });

        try {
          // Sign MintApproval: session mode uses kernel-wrapped signing (ERC-1271
          // validated on-chain via smart account's isValidSignature), wallet mode
          // uses wagmi's signTypedDataAsync.
          if (isUsingSession && sessionSignTypedData) {
            counterpartySignature = await sessionSignTypedData({
              domain: {
                ...typedData.domain,
                chainId: Number(typedData.domain.chainId),
              },
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message as Record<string, unknown>,
            });
          } else {
            counterpartySignature = await signTypedDataAsync({
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
          const error = e instanceof Error ? e : new Error(String(e));
          onSignatureRejected?.(error);
          return {
            success: false,
            error: `Signature rejected: ${error.message}`,
          };
        }
      }

      if (!counterpartySignature) {
        return { success: false, error: 'No signature returned' };
      }

      // Send over shared Auction WS (fire and forget - no ack wait)
      const client = getSharedAuctionWsClient(wsUrl);

      const escrowPayload = {
        auctionId,
        counterparty: signerAddress,
        counterpartyCollateral: counterpartyCollateral.toString(),
        counterpartyNonce: Number(counterpartyNonce),
        counterpartyDeadline,
        counterpartySignature,
      };
      client.send({ type: 'bid.submit', payload: escrowPayload });

      // Dispatch event for UI updates
      try {
        window.dispatchEvent(new Event('auction.bid.submitted'));
      } catch {
        void 0;
      }

      // Bid was signed and sent - return success
      return {
        success: true,
        signature: counterpartySignature,
        counterpartyDeadline,
      };
    },
    [
      address,
      chainId,
      verifyingContract,
      wsUrl,
      signTypedDataAsync,
      onSignatureRejected,
      effectiveAddress,
      isUsingSession,
      isUsingSmartAccount,
      sessionSignTypedData,
      sessionSignTypedData,
      chainClients,
      wusdeAddress,
      formatAmount,
      toast,
    ]
  );

  return {
    submitBid,
    isConnected: Boolean(address),
    address,
    chainId,
    wsUrl,
    verifyingContract,
    tokenDecimals,
    formatAmount,
    parseAmount,
  };
}
