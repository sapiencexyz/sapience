'use client';

/**
 * Bid submission hook supporting both V1 (mainnet) and V2 (testnet) protocols.
 * V1: Uses SignatureProcessor.Approve EIP-712 format
 * V2: Uses MintApproval EIP-712 format from PredictionMarketEscrow
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
} from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';
import { buildCounterpartyMintTypedData, computePredictionHash, hashMintApproval } from '@sapience/sdk/auction/v2Signing';
import { computePickConfigId } from '@sapience/sdk/auction/v2Encoding';
import { recoverTypedDataAddress } from 'viem';
import { type Pick as V2Pick, OutcomeSide } from '@sapience/sdk';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import {
  decodeAuctionPredictedOutcomes,
  decodedOutcomesToV2Picks,
} from '~/lib/auction/decodePredictedOutcomes';
import { useV2Nonce } from '~/hooks/blockchain/useV2Contract';

export type BidSubmissionParams = {
  auctionId: string;
  /** Bidder's wager in wei */
  makerWager: bigint;
  /** Auction creator's wager in wei */
  takerWager: bigint;
  /** Encoded predicted outcomes (V1) */
  predictedOutcomes: `0x${string}`[];
  /** Resolver contract address */
  resolver: `0x${string}`;
  /** Auction creator (taker) address */
  taker: `0x${string}`;
  /** Taker nonce for the auction (required for V1, not needed for V2) */
  takerNonce?: number;
  /** Bid expiry in seconds from now */
  expirySeconds: number;
  /** Optional max end time (seconds since epoch) to clamp expiry */
  maxEndTimeSec?: number;
  /** Force V1 protocol even on V2-capable chains (for V1 auctions) */
  forceV1?: boolean;
  /** V2 picks array (for V2 auctions - used instead of decoding predictedOutcomes) */
  v2Picks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
};

export type BidSubmissionResult = {
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

interface UseBidSubmissionResult {
  /** Submit a bid with signing and WebSocket transmission */
  submitBid: (params: BidSubmissionParams) => Promise<BidSubmissionResult>;
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

export function useBidSubmission(
  options: UseBidSubmissionOptions = {}
): UseBidSubmissionResult {
  const { onSignatureRejected } = options;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  // TODO: Get chainId from context/props when supporting multiple chains
  const chainId = CHAIN_ID_ETHEREAL_TESTNET;
  const { apiBaseUrl } = useSettings();
  const { effectiveAddress, signTypedData: sessionSignTypedData, isUsingSession } = useSession();

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  // V2 (testnet) uses PredictionMarketEscrow, V1 (mainnet) uses PredictionMarket
  const isV2Chain = chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const verifyingContract = (
    isV2Chain
      ? predictionMarketEscrow[chainId]?.address
      : predictionMarket[chainId]?.address
  ) as `0x${string}` | undefined;

  // Get V2 nonce for counterparty signing (only used on V2 chains)
  const { nonce: v2Nonce } = useV2Nonce({
    address: effectiveAddress as Address | undefined,
    chainId,
    enabled: isV2Chain,
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
    async (params: BidSubmissionParams): Promise<BidSubmissionResult> => {
      const {
        auctionId,
        makerWager,
        takerWager,
        predictedOutcomes,
        resolver,
        taker,
        takerNonce,
        expirySeconds,
        maxEndTimeSec,
        forceV1 = false,
        v2Picks: providedV2Picks,
      } = params;

      // Determine if we should use V2 protocol
      // Use V2 only if on V2 chain AND auction is not forced to V1
      const useV2Protocol = isV2Chain && !forceV1;

      // Use effectiveAddress from session context (smart account when session active, otherwise EOA)
      const signerAddress = effectiveAddress;

      // Validate required data
      if (!signerAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!auctionId) {
        return { success: false, error: 'Auction ID required' };
      }

      if (makerWager <= 0n) {
        return { success: false, error: 'Invalid bid amount' };
      }

      const encodedPredicted = predictedOutcomes[0];
      // V2 auctions use v2Picks, V1 auctions use predictedOutcomes
      const hasV2Picks = providedV2Picks && providedV2Picks.length > 0;
      if (!hasV2Picks && !encodedPredicted) {
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

      if (useV2Protocol) {
        // V2 signing: Use MintApproval typed data
        // Use provided v2Picks directly if available, otherwise decode from predictedOutcomes
        let picks: V2Pick[];

        if (providedV2Picks && providedV2Picks.length > 0) {
          // Use provided V2 picks directly (already in correct format from auction data)
          picks = providedV2Picks.map((p) => ({
            conditionResolver: p.conditionResolver as `0x${string}`,
            conditionId: p.conditionId as `0x${string}`,
            predictedOutcome: p.predictedOutcome as OutcomeSide,
          }));
        } else {
          // Fall back to decoding from predictedOutcomes (V1-style auctions on V2 chain)
          const decoded = decodeAuctionPredictedOutcomes({
            resolver,
            predictedOutcomes,
          });
          picks = decodedOutcomesToV2Picks(decoded, resolver);
        }

        if (picks.length === 0) {
          return {
            success: false,
            error: 'Could not decode picks for V2 signing',
          };
        }

        // Get counterparty nonce (bidder's nonce)
        const counterpartyNonce = v2Nonce ?? 0n;

        // Build V2 typed data for counterparty (bidder)
        // In V2 terms: predictor = taker (auction creator), counterparty = maker (bidder)
        const typedData = buildCounterpartyMintTypedData({
          picks,
          predictorWager: takerWager, // auction creator's wager
          counterpartyWager: makerWager, // bidder's wager
          predictor: taker, // auction creator
          counterparty: signerAddress, // bidder (us)
          counterpartyNonce,
          counterpartyDeadline: BigInt(makerDeadline),
          verifyingContract: verifyingContract,
          chainId,
        });

        // DEBUG: Log the exact values being signed for V2 bid
        const debugPickConfigId = computePickConfigId(picks);
        const debugPredictionHash = computePredictionHash(
          debugPickConfigId,
          takerWager,
          makerWager,
          taker,
          signerAddress
        );
        console.log('[V2 Bid Signing] Values being signed:');
        console.log('  picks:', picks.map(p => ({
          resolver: p.conditionResolver,
          conditionId: p.conditionId.slice(0, 10) + '...',
          outcome: p.predictedOutcome,
        })));
        console.log('  pickConfigId:', debugPickConfigId);
        console.log('  predictorWager:', takerWager.toString());
        console.log('  counterpartyWager:', makerWager.toString());
        console.log('  predictor:', taker);
        console.log('  counterparty:', signerAddress);
        console.log('  predictionHash:', debugPredictionHash);
        console.log('  counterpartyNonce:', counterpartyNonce.toString());
        console.log('  counterpartyDeadline:', makerDeadline);
        console.log('  chainId:', chainId);
        console.log('  verifyingContract:', verifyingContract);

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

          // DEBUG: Compute the EIP-712 hash and verify signature locally
          const eip712Hash = hashMintApproval({
            predictionHash: debugPredictionHash,
            signer: signerAddress as `0x${string}`,
            wager: makerWager,
            nonce: counterpartyNonce,
            deadline: BigInt(makerDeadline),
            verifyingContract: verifyingContract,
            chainId,
          });
          console.log('[V2 Bid Signing] EIP-712 hash (SDK):', eip712Hash);
          console.log('[V2 Bid Signing] Signature:', makerSignature);

          // Verify signature locally using viem
          try {
            const recoveredAddress = await recoverTypedDataAddress({
              domain: {
                name: 'PredictionMarketEscrow',
                version: '1',
                chainId: BigInt(chainId),
                verifyingContract: verifyingContract,
              },
              types: typedData.types,
              primaryType: typedData.primaryType,
              message: typedData.message,
              signature: makerSignature,
            });
            console.log('[V2 Bid Signing] Local signature verification:');
            console.log('  Recovered address:', recoveredAddress);
            console.log('  Expected signer:', signerAddress);
            console.log('  Match:', recoveredAddress.toLowerCase() === signerAddress.toLowerCase() ? 'YES' : 'NO');
          } catch (verifyError) {
            console.error('[V2 Bid Signing] Local verification failed:', verifyError);
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
          return { success: false, error: 'Missing taker nonce for V1 signing' };
        }

        const innerMessageHash = keccak256(
          encodeAbiParameters(
            parseAbiParameters(
              'bytes, uint256, uint256, address, address, uint256, uint256'
            ),
            [
              encodedPredicted,
              makerWager,
              takerWager,
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

      if (useV2Protocol) {
        // V2 bid payload - uses V2 terminology (counterparty = bidder)
        const v2Payload = {
          auctionId,
          counterparty: signerAddress,
          counterpartyWager: makerWager.toString(),
          counterpartyNonce: Number(v2Nonce ?? 0n),
          counterpartyDeadline: makerDeadline,
          counterpartySignature: makerSignature,
        };
        client.send({ type: 'v2.bid.submit', payload: v2Payload });
      } else {
        // V1 bid payload
        const payload: Record<string, unknown> = {
          auctionId,
          maker: signerAddress,
          makerDeadline,
          makerNonce: takerNonce,
          makerSignature,
          makerWager: makerWager.toString(),
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
      isV2Chain,
      v2Nonce,
      isUsingSession,
      sessionSignTypedData,
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
