'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseUnits, zeroAddress } from 'viem';
import { useAccount } from 'wagmi';
import { generateRandomNonce } from '@sapience/sdk';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import { OutcomeSide } from '@sapience/sdk/types';
import { useSession } from '~/lib/context/SessionContext';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface UseSingleConditionAuctionProps {
  conditionId: string | null;
  prediction: boolean | null;
  positionSize: string;
  chainId: number;
  collateralDecimals?: number;
  bids: QuoteBid[];
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  resolverAddress?: string | null;
}

interface UseSingleConditionAuctionReturn {
  bestBid: QuoteBid | null;
  triggerQuoteRequest: (options?: { forceRefresh?: boolean }) => void;
  isWaitingForBids: boolean;
  showRequestBidsButton: boolean;
  allBidsExpired: boolean;
  nowMs: number;
}

export function useSingleConditionAuction({
  conditionId,
  prediction,
  positionSize,
  chainId,
  collateralDecimals = 18,
  bids,
  requestQuotes,
  resolverAddress,
}: UseSingleConditionAuctionProps): UseSingleConditionAuctionReturn {
  const { address: predictorAddress } = useAccount();
  const { effectiveAddress } = useSession();
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  const selectedTakerAddress =
    effectiveAddress ?? predictorAddress ?? zeroAddress;

  // Stable ref — read at call time inside triggerQuoteRequest, don't trigger recreation
  const selectedTakerAddressRef = useRef(selectedTakerAddress);
  useEffect(() => {
    selectedTakerAddressRef.current = selectedTakerAddress;
  }, [selectedTakerAddress]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const bestBid = useMemo(() => {
    if (!bids || bids.length === 0) return null;

    const validBids = bids.filter(
      (bid) => bid.counterpartyDeadline * 1000 > nowMs
    );
    if (validBids.length === 0) return null;

    let userPositionSizeWei: bigint;
    try {
      userPositionSizeWei = parseUnits(positionSize || '0', collateralDecimals);
    } catch {
      userPositionSizeWei = 0n;
    }

    return validBids.reduce((best, current) => {
      const bestPayout =
        userPositionSizeWei + BigInt(best.counterpartyCollateral);
      const currentPayout =
        userPositionSizeWei + BigInt(current.counterpartyCollateral);
      return currentPayout > bestPayout ? current : best;
    });
  }, [bids, positionSize, collateralDecimals, nowMs]);

  const allBidsExpired = bids.length > 0 && !bestBid;

  const recentlyRequested =
    lastQuoteRequestMs != null && nowMs - lastQuoteRequestMs < 6000;

  const triggerQuoteRequest = useCallback(
    (options?: { forceRefresh?: boolean }) => {
      if (!requestQuotes) return;
      if (!selectedTakerAddressRef.current) return;
      if (!conditionId || prediction === null) return;

      const positionSizeStr = positionSize || '0';

      try {
        const positionSizeWei = parseUnits(
          positionSizeStr,
          collateralDecimals
        ).toString();
        const effectiveResolver =
          resolverAddress ||
          conditionalTokensConditionResolver[chainId]?.address ||
          null;
        const params: AuctionParams = {
          wager: positionSizeWei,
          predictor: selectedTakerAddress,
          predictorNonce: Number(generateRandomNonce()),
          chainId,
          picks: effectiveResolver
            ? [
                {
                  conditionResolver: effectiveResolver as `0x${string}`,
                  conditionId: conditionId as `0x${string}`,
                  predictedOutcome: prediction
                    ? OutcomeSide.YES
                    : OutcomeSide.NO,
                },
              ]
            : [],
        };

        requestQuotes(params, options);
        setLastQuoteRequestMs(Date.now());
      } catch {
        // parseUnits may throw on invalid input
      }
    },
    [
      requestQuotes,
      conditionId,
      prediction,
      positionSize,
      collateralDecimals,
      chainId,
      resolverAddress,
    ]
  );

  useEffect(() => {
    if (conditionId && prediction !== null && positionSize) {
      triggerQuoteRequest();
    }
  }, [conditionId, prediction, positionSize, triggerQuoteRequest]);

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
