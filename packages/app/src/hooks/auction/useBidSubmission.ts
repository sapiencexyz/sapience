'use client';

import { useCallback, useMemo } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
  parseUnits,
  formatUnits,
} from 'viem';
import { predictionMarket } from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSession } from '~/lib/context/SessionContext';
import { toAuctionWsUrl } from '~/lib/ws';
// Note: Owner's wallet signs bid requests (not session key) so relayer can verify
// smart account ownership by computing the smart account address from the recovered signer.
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';

export type BidSubmissionParams = {
  auctionId: string;
  /** Bidder's wager in wei */
  makerWager: bigint;
  /** Auction creator's wager in wei */
  takerWager: bigint;
  /** Encoded predicted outcomes */
  predictedOutcomes: `0x${string}`[];
  /** Resolver contract address */
  resolver: `0x${string}`;
  /** Auction creator (taker) address */
  taker: `0x${string}`;
  /** Taker nonce for the auction */
  takerNonce: number;
  /** Bid expiry in seconds from now */
  expirySeconds: number;
  /** Optional max end time (seconds since epoch) to clamp expiry */
  maxEndTimeSec?: number;
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
  const chainId = CHAIN_ID_ETHEREAL;
  const { apiBaseUrl } = useSettings();
  const { isSessionActive, smartAccountAddress } = useSession();

  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const verifyingContract = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

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
      } = params;

      // Use smart account address as maker when session is active
      const signerAddress =
        isSessionActive && smartAccountAddress ? smartAccountAddress : address;

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
      if (!encodedPredicted) {
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

      // Build inner message hash (bytes, uint256, uint256, address, address, uint256, uint256)
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

      // EIP-712 domain and types per SignatureProcessor
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

      // Always use owner's wallet for signing (even when session is active)
      // Relayer verifies ownership by computing smart account from recovered signer
      let makerSignature: `0x${string}`;
      try {
        makerSignature = await signTypedDataAsync({
          domain,
          types,
          primaryType: 'Approve',
          message,
        });
      } catch (e: any) {
        const error =
          e instanceof Error ? e : new Error(String(e?.message || e));
        onSignatureRejected?.(error);
        return {
          success: false,
          error: `Signature rejected: ${error.message}`,
        };
      }

      if (!makerSignature) {
        return { success: false, error: 'No signature returned' };
      }

      // Build bid payload
      const payload: Record<string, unknown> = {
        auctionId,
        maker: signerAddress,
        makerDeadline,
        makerNonce: takerNonce,
        makerSignature,
        makerWager: makerWager.toString(),
      };

      // Send over shared Auction WS (fire and forget - no ack wait)
      const client = getSharedAuctionWsClient(wsUrl);
      client.send({ type: 'bid.submit', payload });

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
      isSessionActive,
      smartAccountAddress,
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
