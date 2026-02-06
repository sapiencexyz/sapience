'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits, zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import { useSession } from '~/lib/context/SessionContext';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface UseSingleConditionAuctionProps {
  /** The condition ID to bet on */
  conditionId: string | null;
  /** User's prediction: true = Yes, false = No, null = unselected */
  prediction: boolean | null;
  /** Wager amount as a string (human-readable, e.g., "10") */
  wagerAmount: string;
  /** Chain ID for the prediction market */
  chainId: number;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** PredictionMarket contract address for nonce fetching */
  predictionMarketAddress?: `0x${string}`;
  /** Bids from useAuctionStart */
  bids: QuoteBid[];
  /** Request quotes function from useAuctionStart */
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean; requireSignature?: boolean }
  ) => void;
}

interface UseSingleConditionAuctionReturn {
  /** The best valid bid (highest payout, not expired) */
  bestBid: QuoteBid | null;
  /** Trigger a quote request (optionally force refresh) */
  triggerQuoteRequest: (options?: {
    forceRefresh?: boolean;
    requireSignature?: boolean;
  }) => void;
  /** Whether we're waiting for bids (recently requested, no bids yet) */
  isWaitingForBids: boolean;
  /** Whether to show "Request Bids" button (no valid bids, not recently requested) */
  showRequestBidsButton: boolean;
  /** Whether all received bids have expired */
  allBidsExpired: boolean;
  /** Current time in ms (updates every second for expiration tracking) */
  nowMs: number;
}

/**
 * Hook for managing auction quotes for a single condition.
 * Extracts shared logic from PositionForm for reuse in PredictionForm.
 */
export function useSingleConditionAuction({
  conditionId,
  prediction,
  wagerAmount,
  chainId,
  collateralDecimals = 18,
  predictionMarketAddress,
  bids,
  requestQuotes,
}: UseSingleConditionAuctionProps): UseSingleConditionAuctionReturn {
  const { address: takerAddress } = useAccount();
  const { effectiveAddress } = useSession();
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  // Use effectiveAddress from session context, falling back to zero address for guests
  const selectedTakerAddress = effectiveAddress ?? takerAddress ?? zeroAddress;

  // Fetch taker nonce from PredictionMarket contract
  const { data: takerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId,
    query: {
      enabled: !!selectedTakerAddress && !!predictionMarketAddress,
    },
  });

  // Update time every second for expiration tracking
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Find the best valid bid (not expired, highest payout)
  const bestBid = useMemo(() => {
    if (!bids || bids.length === 0) return null;

    const validBids = bids.filter((bid) => bid.makerDeadline * 1000 > nowMs);
    if (validBids.length === 0) return null;

    // Parse user's wager to wei for payout calculation
    let userWagerWei: bigint;
    try {
      userWagerWei = parseUnits(wagerAmount || '0', collateralDecimals);
    } catch {
      userWagerWei = 0n;
    }

    // Find bid with highest total payout (userWager + makerWager)
    return validBids.reduce((best, current) => {
      const bestPayout = (() => {
        try {
          return userWagerWei + BigInt(best.makerWager);
        } catch {
          return 0n;
        }
      })();
      const currentPayout = (() => {
        try {
          return userWagerWei + BigInt(current.makerWager);
        } catch {
          return 0n;
        }
      })();

      return currentPayout > bestPayout ? current : best;
    });
  }, [bids, wagerAmount, collateralDecimals, nowMs]);

  // Check if all bids have expired
  const allBidsExpired = bids.length > 0 && !bestBid;

  // Check if we recently made a request (within 6 seconds)
  const recentlyRequested =
    lastQuoteRequestMs != null && nowMs - lastQuoteRequestMs < 6000;

  // Trigger auction quote request
  const triggerQuoteRequest = useCallback(
    (options?: { forceRefresh?: boolean; requireSignature?: boolean }) => {
      if (!requestQuotes) return;
      if (!selectedTakerAddress) return;
      if (!conditionId || prediction === null) return;
      // Wait for nonce if using a real address (not guest)
      if (selectedTakerAddress !== zeroAddress && takerNonce === undefined)
        return;

      const wagerStr = wagerAmount || '0';

      try {
        const wagerWei = parseUnits(wagerStr, collateralDecimals).toString();
        const outcomes = [
          {
            marketId: conditionId,
            prediction: prediction,
          },
        ];
        const payload = buildAuctionStartPayload(outcomes, chainId);
        const params: AuctionParams = {
          wager: wagerWei,
          resolver: payload.resolver,
          predictedOutcomes: payload.predictedOutcomes,
          taker: selectedTakerAddress,
          takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
          chainId: chainId,
        };

        // For "forecast/preview" quotes we should never prompt a wallet signature.
        // (Matches `MarketPredictionRequest` behavior.)
        requestQuotes(params, { requireSignature: false, ...options });
        setLastQuoteRequestMs(Date.now());
      } catch {
        // ignore formatting errors
      }
    },
    [
      requestQuotes,
      selectedTakerAddress,
      conditionId,
      prediction,
      takerNonce,
      wagerAmount,
      collateralDecimals,
      chainId,
    ]
  );

  // Auto-trigger quote request when inputs change
  useEffect(() => {
    if (conditionId && prediction !== null && wagerAmount) {
      triggerQuoteRequest();
    }
  }, [conditionId, prediction, wagerAmount, triggerQuoteRequest]);

  // Show "Request Bids" button when:
  // 1. No valid bids exist (never received or all expired)
  // 2. Not in the 3-second cooldown period after making a request
  const showRequestBidsButton =
    !bestBid &&
    !recentlyRequested &&
    (allBidsExpired || lastQuoteRequestMs != null);

  // Waiting for bids = recently requested but no valid bids yet
  const isWaitingForBids = recentlyRequested && !bestBid;

  return {
    bestBid,
    triggerQuoteRequest,
    isWaitingForBids,
    showRequestBidsButton,
    allBidsExpired,
    nowMs,
  };
}
