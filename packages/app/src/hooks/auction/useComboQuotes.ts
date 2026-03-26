'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import { OutcomeSide } from '@sapience/sdk/types';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import hub from '~/lib/auction/useAuctionBidsHub';
import type { RecentCombo } from '~/hooks/graphql/useRecentCombos';

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;
const PREDICTOR_POSITION_SIZE_WEI = parseUnits('1', 18).toString();

/**
 * Requests 1 USDe auction quotes for each combo and returns live probabilities
 * keyed by pickConfigId.
 */
export function useComboQuotes(combos: RecentCombo[], chainId: number) {
  const { apiBaseUrl } = useSettings();
  const { address: walletAddress } = useAccount();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const PREDICTION_MARKET_ADDRESS =
    predictionMarketEscrow[chainId]?.address ||
    predictionMarketEscrow[DEFAULT_CHAIN_ID]?.address;

  const selectedPredictorAddress = walletAddress || ZERO_ADDRESS;

  const { data: predictorNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketEscrowAbi,
    functionName: 'getNonce',
    args: selectedPredictorAddress ? [selectedPredictorAddress] : undefined,
    chainId,
    query: {
      enabled: !!selectedPredictorAddress && !!PREDICTION_MARKET_ADDRESS,
    },
  });

  // Map pickConfigId → auctionId
  const [auctionIds, setAuctionIds] = useState<Map<string, string>>(new Map());
  const [hubTick, setHubTick] = useState(0);
  const requestedRef = useRef<Set<string>>(new Set());

  // Subscribe to hub updates
  useEffect(() => {
    if (wsUrl) hub.setUrl(wsUrl);
    const off = hub.addListener(() => setHubTick((t) => (t + 1) % 1_000_000));
    return () => off();
  }, [wsUrl]);

  // Request quotes; pass force=true to re-request all (e.g. refresh button)
  const requestQuotes = useCallback(
    (force?: boolean) => {
      if (!wsUrl || combos.length === 0) return;

      if (force) requestedRef.current.clear();

      const client = getSharedAuctionWsClient(wsUrl);
      const nowSec = Math.floor(Date.now() / 1000);

      for (const combo of combos) {
        if (requestedRef.current.has(combo.pickConfigId)) continue;
        requestedRef.current.add(combo.pickConfigId);

        const rawPicks = combo.picks
          .filter((p) => p.condition)
          .map((p) => ({
            conditionResolver: p.conditionResolver as `0x${string}`,
            conditionId: (p.conditionId.startsWith('0x')
              ? p.conditionId
              : `0x${p.conditionId}`) as `0x${string}`,
            predictedOutcome: p.predictedOutcome as OutcomeSide,
          }));

        if (rawPicks.length < 2) continue;

        const picks = canonicalizePicks(rawPicks);

        const requestPayload = {
          picks: picks.map((p) => ({
            conditionResolver: p.conditionResolver,
            conditionId: p.conditionId,
            predictedOutcome: p.predictedOutcome,
          })),
          predictorCollateral: PREDICTOR_POSITION_SIZE_WEI,
          predictor: selectedPredictorAddress,
          predictorNonce:
            predictorNonce !== undefined ? Number(predictorNonce) : 0,
          predictorDeadline: nowSec + 300,
          chainId,
        };

        const pickConfigId = combo.pickConfigId;

        client
          .sendWithAck<{ auctionId?: string }>(
            'auction.start',
            requestPayload,
            {
              timeoutMs: 15000,
            }
          )
          .then((response) => {
            const auctionId = response?.auctionId;
            if (auctionId) {
              hub.ensureSubscribed(auctionId);
              setAuctionIds((prev) => {
                const next = new Map(prev);
                next.set(pickConfigId, auctionId);
                return next;
              });
            }
          })
          .catch(() => {
            // Quote request failed — combo will show GQL-derived probability
          });
      }
    },
    [wsUrl, combos, chainId, selectedPredictorAddress, predictorNonce]
  );

  // Request quotes when combos arrive
  useEffect(() => {
    if (combos.length > 0) {
      requestQuotes();
    }
  }, [combos.length, requestQuotes]);

  // Compute live probabilities from hub bids
  const quoteProbabilities = useMemo(() => {
    const result = new Map<string, number>();

    for (const [pickConfigId, auctionId] of auctionIds.entries()) {
      const allBids = hub.bidsByAuctionId.get(auctionId);
      if (!allBids || allBids.length === 0) continue;

      // For anonymous users, only accept bids from the trusted quoter
      const isAnonymousUser = selectedPredictorAddress === ZERO_ADDRESS;
      const bids = isAnonymousUser
        ? allBids.filter(
            (b) =>
              b.counterparty?.toLowerCase() ===
              PREFERRED_ESTIMATE_QUOTER.toLowerCase()
          )
        : allBids;
      if (bids.length === 0) continue;

      const nowMs = Date.now();
      const valid = bids.filter((b) => {
        const dl = Number(b?.counterpartyDeadline || 0);
        return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
      });
      const list = valid.length > 0 ? valid : bids;
      const best = list.reduce((acc, cur) =>
        BigInt(cur.counterpartyCollateral) > BigInt(acc.counterpartyCollateral)
          ? cur
          : acc
      );

      const predictorWei = BigInt(PREDICTOR_POSITION_SIZE_WEI);
      const counterpartyWei = BigInt(
        String(best?.counterpartyCollateral || '0')
      );
      const denom = counterpartyWei + predictorWei;
      const prob = denom > 0n ? Number(counterpartyWei) / Number(denom) : null;
      if (prob !== null) {
        result.set(pickConfigId, Math.max(0, Math.min(1, prob)));
      }
    }

    return result;
    // hubTick is used to trigger re-computation when bids arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionIds, selectedPredictorAddress, hubTick]);

  return { quoteProbabilities, requestQuotes };
}
