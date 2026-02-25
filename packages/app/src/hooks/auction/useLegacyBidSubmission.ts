'use client';

/**
 * Legacy bid submission hook supporting both V1 (mainnet) and escrow (testnet) protocols.
 * V1: Uses SignatureProcessor.Approve EIP-712 format
 * Escrow: Uses MintApproval EIP-712 format from PredictionMarketEscrow
 */
import { useCallback, useMemo } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
  parseUnits,
  formatUnits,
  type Address,
} from 'viem';
import {
  predictionMarket,
  predictionMarketEscrow,
  collateralToken as collateralTokenAddresses,
} from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';
import { erc20Abi, encodeFunctionData, parseAbi } from 'viem';

// wUSDe ABI for deposit function (wraps native USDe to wUSDe)
const WUSDE_DEPOSIT_ABI = parseAbi(['function deposit() payable']);
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import type { OutcomeSide } from '@sapience/sdk';
import { type Pick as EscrowPick } from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { encodeEscrowSessionKeyData } from '~/lib/session/sessionKeyManager';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import {
  decodeAuctionPredictedOutcomes,
  decodedOutcomesToPicks,
} from '~/lib/auction/decodePredictedOutcomes';
import { useEscrowNonce } from '~/hooks/blockchain/useEscrowContract';

export type LegacyBidSubmissionParams = {
  auctionId: string;
  /** Bidder's position size in wei */
  makerCollateral: bigint;
  /** Auction creator's position size in wei */
  takerCollateral: bigint;
  /** Encoded predicted outcomes (V1) */
  predictedOutcomes: `0x${string}`[];
  /** Resolver contract address */
  resolver: `0x${string}`;
  /** Auction creator (taker) address */
  taker: `0x${string}`;
  /** Taker nonce for the auction (required for legacy, not needed for escrow) */
  takerNonce?: number;
  /** Bid expiry in seconds from now */
  expirySeconds: number;
  /** Optional max end time (seconds since epoch) to clamp expiry */
  maxEndTimeSec?: number;
  /** Force legacy protocol even on escrow-capable chains (for legacy auctions) */
  forceV1?: boolean;
  /** Escrow picks array (for escrow auctions - used instead of decoding predictedOutcomes) */
  escrowPicks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
};

export type LegacyBidSubmissionResult = {
  success: boolean;
  error?: string;
  /** The signature if successful */
  signature?: `0x${string}`;
  /** The deadline used */
  makerDeadline?: number;
};

interface UseBidSubmissionOptions {
  /** Called when signature is rejected by user */
  onSignatureRejected?: (error: Error) => void;
}

interface UseLegacyBidSubmissionResult {
  /** Submit a bid with signing and WebSocket transmission */
  submitBid: (params: LegacyBidSubmissionParams) => Promise<LegacyBidSubmissionResult>;
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

export function useLegacyBidSubmission(
  options: UseBidSubmissionOptions = {}
): UseLegacyBidSubmissionResult {
  const { onSignatureRejected } = options;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  // TODO: Get chainId from context/props when supporting multiple chains
  const chainId = CHAIN_ID_ETHEREAL_TESTNET;
  const { apiBaseUrl } = useSettings();
  const {
    effectiveAddress,
    signTypedData: sessionSignTypedData,
    isUsingSession,
    isUsingSmartAccount,
    escrowSessionKeyApproval,
    chainClients,
  } = useSession();
  const { toast } = useToast();

  // Get wUSDe contract address for the chain
  const wusdeAddress = collateralTokenAddresses[chainId]?.address as
    | Address
    | undefined;

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  // Escrow (testnet) uses PredictionMarketEscrow, legacy (mainnet) uses PredictionMarket
  const isEscrowChain = chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const verifyingContract = (
    isEscrowChain
      ? predictionMarketEscrow[chainId]?.address
      : predictionMarket[chainId]?.address
  ) as `0x${string}` | undefined;

  // Get escrow nonce for counterparty signing (only used on escrow chains)
  const { nonce: escrowNonce } = useEscrowNonce({
    address: effectiveAddress as Address | undefined,
    chainId,
    enabled: isEscrowChain,
  });

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
    async (params: LegacyBidSubmissionParams): Promise<LegacyBidSubmissionResult> => {
      const {
        auctionId,
        makerCollateral,
        takerCollateral,
        predictedOutcomes,
        resolver,
        taker,
        takerNonce,
        expirySeconds,
        maxEndTimeSec,
        forceV1 = false,
        escrowPicks: providedEscrowPicks,
      } = params;

      // Determine if we should use escrow protocol
      // Use escrow only if on escrow chain AND auction is not forced to legacy
      const useEscrowProtocol = isEscrowChain && !forceV1;

      // Use effectiveAddress from session context (smart account when session active, otherwise EOA)
      const signerAddress = effectiveAddress;

      // Validate required data
      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      // Smart account mode is not supported for terminal bidding
      if (isUsingSmartAccount) {
        toast({
          title: 'Smart Account Not Supported',
          description:
            'The trading terminal does not currently support smart account mode. Please switch to EOA mode in settings to place bids.',
          variant: 'destructive',
          duration: 6000,
        });
        return {
          success: false,
          error: 'Smart account mode not supported for terminal bidding',
        };
      }

      if (!auctionId) {
        return { success: false, error: 'Auction ID required' };
      }

      if (makerCollateral <= 0n) {
        return { success: false, error: 'Invalid bid amount' };
      }

      const encodedPredicted = predictedOutcomes[0];
      // Escrow auctions use escrowPicks, legacy auctions use predictedOutcomes
      const hasEscrowPicks = providedEscrowPicks && providedEscrowPicks.length > 0;
      if (!hasEscrowPicks && !encodedPredicted) {
        return { success: false, error: 'Missing predicted outcomes' };
      }

      if (!resolver) {
        return { success: false, error: 'Missing resolver' };
      }

      if (!taker) {
        return { success: false, error: 'Missing taker address' };
      }

      if (!verifyingContract) {
        return { success: false, error: 'Missing verifying contract' };
      }

      if (!wsUrl) {
        return { success: false, error: 'Realtime connection not configured' };
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
      const makerDeadline = nowSec + clampedExpiry;

      let makerSignature: `0x${string}`;

      if (useEscrowProtocol) {
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

            const needsMoreWusde = wusdeBalance < makerCollateral;
            const needsMoreAllowance = wusdeAllowance < makerCollateral;

            if (needsMoreWusde || needsMoreAllowance) {
              // Check native USDe balance for potential wrapping
              const nativeUsdeBalance = await publicClient.getBalance({
                address: signerAddress,
              });

              // Also check if there's depositable USDe token (not native ETH-like)
              // wUSDe.deposit() wraps native USDe sent as msg.value
              const wrapAmount = needsMoreWusde
                ? makerCollateral - wusdeBalance
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
                    args: [escrowAddress, makerCollateral],
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
                  console.error('[Escrow Bid] Fund preparation failed:', prepError);
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
        // Use provided escrowPicks directly if available, otherwise decode from predictedOutcomes
        let picks: EscrowPick[];

        if (providedEscrowPicks && providedEscrowPicks.length > 0) {
          // Use provided escrow picks directly (already in correct format from auction data)
          picks = providedEscrowPicks.map((p) => ({
            conditionResolver: p.conditionResolver as `0x${string}`,
            conditionId: p.conditionId as `0x${string}`,
            predictedOutcome: p.predictedOutcome as OutcomeSide,
          }));
        } else {
          // Fall back to decoding from predictedOutcomes (legacy-style auctions on escrow chain)
          const decoded = decodeAuctionPredictedOutcomes({
            resolver,
            predictedOutcomes,
          });
          picks = decodedOutcomesToPicks(decoded, resolver);
        }

        if (picks.length === 0) {
          return {
            success: false,
            error: 'Could not decode picks for escrow signing',
          };
        }

        // Get counterparty nonce (bidder's nonce)
        const counterpartyNonce = escrowNonce ?? 0n;

        // Build escrow typed data for counterparty (bidder)
        // In escrow terms: predictor = taker (auction creator), counterparty = maker (bidder)
        const typedData = buildCounterpartyMintTypedData({
          picks,
          predictorCollateral: takerCollateral, // auction creator's collateral
          counterpartyCollateral: makerCollateral, // bidder's collateral
          predictor: taker, // auction creator
          counterparty: signerAddress, // bidder (us)
          counterpartyNonce,
          counterpartyDeadline: BigInt(makerDeadline),
          predictorSponsor: '0x0000000000000000000000000000000000000000',
          predictorSponsorData: '0x',
          verifyingContract: verifyingContract,
          chainId,
        });

        try {
          // Use session key signing if session is active, otherwise use wallet
          if (isUsingSession && sessionSignTypedData) {
            makerSignature = await sessionSignTypedData({
              domain: {
                ...typedData.domain,
                chainId: Number(typedData.domain.chainId),
              },
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message as Record<string, unknown>,
            });
          } else {
            makerSignature = await signTypedDataAsync({
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
          const error =
            e instanceof Error ? e : new Error(String(e?.message || e));
          onSignatureRejected?.(error);
          return {
            success: false,
            error: `Signature rejected: ${error.message}`,
          };
        }
      } else {
        // V1 signing: Use SignatureProcessor.Approve typed data
        // V1 requires takerNonce
        if (takerNonce === undefined) {
          return {
            success: false,
            error: 'Missing taker nonce for V1 signing',
          };
        }

        const innerMessageHash = keccak256(
          encodeAbiParameters(
            parseAbiParameters(
              'bytes, uint256, uint256, address, address, uint256, uint256'
            ),
            [
              encodedPredicted,
              makerCollateral,
              takerCollateral,
              getAddress(resolver),
              getAddress(taker),
              BigInt(makerDeadline),
              BigInt(takerNonce),
            ]
          )
        );

        const domain = {
          name: 'SignatureProcessor',
          version: '1',
          chainId: chainId,
          verifyingContract,
        } as const;

        const types = {
          Approve: [
            { name: 'messageHash', type: 'bytes32' },
            { name: 'owner', type: 'address' },
          ],
        } as const;

        const message = {
          messageHash: innerMessageHash,
          owner: getAddress(signerAddress),
        } as const;

        try {
          // Use session key signing if session is active, otherwise use wallet
          if (isUsingSession && sessionSignTypedData) {
            makerSignature = await sessionSignTypedData({
              domain,
              types,
              primaryType: 'Approve',
              message: message as Record<string, unknown>,
            });
          } else {
            makerSignature = await signTypedDataAsync({
              domain,
              types,
              primaryType: 'Approve',
              message,
            });
          }
        } catch (e: any) {
          const error =
            e instanceof Error ? e : new Error(String(e?.message || e));
          onSignatureRejected?.(error);
          return {
            success: false,
            error: `Signature rejected: ${error.message}`,
          };
        }
      }

      if (!makerSignature) {
        return { success: false, error: 'No signature returned' };
      }

      // Send over shared Auction WS (fire and forget - no ack wait)
      const client = getSharedAuctionWsClient(wsUrl);

      if (useEscrowProtocol) {
        // Escrow bid payload - uses escrow terminology (counterparty = bidder)
        // For new sessions: no session key data needed (ERC-1271 signature is sufficient)
        // For legacy sessions: include session key approval data
        let counterpartySessionKeyData: string | undefined;
        if (isUsingSession && escrowSessionKeyApproval) {
          counterpartySessionKeyData = encodeEscrowSessionKeyData(escrowSessionKeyApproval);
        }

        const escrowPayload = {
          auctionId,
          counterparty: signerAddress,
          counterpartyCollateral: makerCollateral.toString(),
          counterpartyNonce: Number(escrowNonce ?? 0n),
          counterpartyDeadline: makerDeadline,
          counterpartySignature: makerSignature,
          ...(counterpartySessionKeyData && { counterpartySessionKeyData }),
        };
        client.send({ type: 'bid.submit', payload: escrowPayload });
      } else {
        // V1 bid payload
        const payload: Record<string, unknown> = {
          auctionId,
          maker: signerAddress,
          makerDeadline,
          makerNonce: takerNonce,
          makerSignature,
          makerCollateral: makerCollateral.toString(),
        };
        client.send({ type: 'bid.submit', payload });
      }

      // Dispatch event for UI updates
      try {
        window.dispatchEvent(new Event('auction.bid.submitted'));
      } catch {
        void 0;
      }

      // Bid was signed and sent - return success
      return {
        success: true,
        signature: makerSignature,
        makerDeadline,
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
      isEscrowChain,
      escrowNonce,
      isUsingSession,
      isUsingSmartAccount,
      sessionSignTypedData,
      escrowSessionKeyApproval,
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
