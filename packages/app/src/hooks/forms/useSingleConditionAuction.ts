'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits, zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import { useSession } from '~/lib/context/SessionContext';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface UseSingleConditionAuctionProps {
  /** The condition ID to predict on */
  conditionId: string | null;
  /** User's prediction: true = Yes, false = No, null = unselected */
  prediction: boolean | null;
  /** Position size as a string (human-readable, e.g., "10") */
  positionSize: string;
  /** Chain ID for the prediction market */
  chainId: number;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** PredictionMarketEscrow contract address for nonce fetching */
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
  positionSize,
  chainId,
  collateralDecimals = 18,
  predictionMarketAddress,
  bids,
  requestQuotes,
}: UseSingleConditionAuctionProps): UseSingleConditionAuctionReturn {
  const { address: predictorAddress } = useAccount();
  const { effectiveAddress } = useSession();
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  // Use effectiveAddress from session context, falling back to zero address for guests
  const selectedPredictorAddress = effectiveAddress ?? predictorAddress ?? zeroAddress;

  // Fetch predictor nonce from PredictionMarketEscrow contract
  const { data: predictorNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketEscrowAbi,
    functionName: 'getNonce',
    args: selectedPredictorAddress ? [selectedPredictorAddress] : undefined,
    chainId,
    query: {
      enabled: !!selectedPredictorAddress && !!predictionMarketAddress,
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

    // makerDeadline = counterparty's deadline (legacy naming in QuoteBid type)
    const validBids = bids.filter((bid) => bid.makerDeadline * 1000 > nowMs);
    if (validBids.length === 0) return null;

    // Parse user's position size to wei for payout calculation
    let predictorCollateralWei: bigint;
    try {
      predictorCollateralWei = parseUnits(positionSize || '0', collateralDecimals);
    } catch {
      predictorCollateralWei = 0n;
    }

    // Find bid with highest total payout (predictorCollateral + counterpartyCollateral)
    // makerCollateral = counterparty's collateral (legacy naming in QuoteBid type)
    return validBids.reduce((best, current) => {
      const bestPayout = (() => {
        try {
          return predictorCollateralWei + BigInt(best.makerCollateral);
        } catch {
          return 0n;
        }
      })();
      const currentPayout = (() => {
        try {
          return predictorCollateralWei + BigInt(current.makerCollateral);
        } catch {
          return 0n;
        }
      })();

      return currentPayout > bestPayout ? current : best;
    });
  }, [bids, positionSize, collateralDecimals, nowMs]);

  // Check if all bids have expired
  const allBidsExpired = bids.length > 0 && !bestBid;

  // Check if we recently made a request (within 6 seconds)
  const recentlyRequested =
    lastQuoteRequestMs != null && nowMs - lastQuoteRequestMs < 6000;

  // Trigger auction quote request
  const triggerQuoteRequest = useCallback(
    (options?: { forceRefresh?: boolean; requireSignature?: boolean }) => {
      if (!requestQuotes) return;
      if (!selectedPredictorAddress) return;
      if (!conditionId || prediction === null) return;
      // Wait for nonce if using a real address (not guest)
      if (selectedPredictorAddress !== zeroAddress && predictorNonce === undefined)
        return;

      const positionSizeStr = positionSize || '0';

      try {
        const positionSizeWei = parseUnits(
          positionSizeStr,
          collateralDecimals
        ).toString();
        const outcomes = [
          {
            marketId: conditionId,
            prediction: prediction,
          },
        ];
        const payload = buildAuctionStartPayload(outcomes, chainId);
        // AuctionParams uses legacy taker/takerNonce naming — maps to predictor/predictorNonce
        const params: AuctionParams = {
          wager: positionSizeWei,
          resolver: payload.resolver,
          predictedOutcomes: payload.predictedOutcomes,
          taker: selectedPredictorAddress,       // predictor address
          takerNonce: predictorNonce !== undefined ? Number(predictorNonce) : 0, // predictor nonce
          chainId: chainId,
        };

        // For "forecast/preview" quotes we should never prompt a wallet signature.
        requestQuotes(params, { requireSignature: false, ...options });
        setLastQuoteRequestMs(Date.now());
      } catch {
        // ignore formatting errors
      }
    },
    [
      requestQuotes,
      selectedPredictorAddress,
      conditionId,
      prediction,
      predictorNonce,
      positionSize,
      collateralDecimals,
      chainId,
    ]
  );

  // Auto-trigger quote request when inputs change
  useEffect(() => {
    if (conditionId && prediction !== null && positionSize) {
      triggerQuoteRequest();
    }
  }, [conditionId, prediction, positionSize, triggerQuoteRequest]);

  // Show "Request Bids" button when no valid bids exist and not recently requested
  const showRequestBidsButton =
    !bestBid &&
    !recentlyRequested &&
    (allBidsExpired || lastQuoteRequestMs != null);

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
