'use client';

import type React from 'react';
import { useMemo } from 'react';
import { formatEther } from 'viem';
import { Badge } from '@sapience/ui/components/ui/badge';
import FeedTable, { type FeedRow } from './FeedTable';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';
import type { UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import {
  TransactionTimeCell,
  TransactionTypeCell,
  TransactionOwnerCell,
  TransactionAmountCell,
  TransactionPositionCell,
  getRowLeftBarColor,
  TransactionQuestionCell,
} from '~/components/markets/DataDrawer/TransactionCells';
import { useSapience } from '~/lib/context/SapienceProvider';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';

function createForecastRow(attestation: FormattedAttestation) {
  const ForecastRow = ({
    tx,
    collateralAssetTicker,
    sortedMarketsForColors,
  }: {
    tx: UiTransaction;
    collateralAssetTicker?: string | null;
    sortedMarketsForColors: any[];
  }) => {
    const comment = (attestation.comment || '').trim() || undefined;
    const leftColor = getRowLeftBarColor(tx, sortedMarketsForColors);
    // Build the x% Chance badge for the Action column
    let actionBadge: React.ReactNode = null;
    try {
      if (attestation && attestation.value) {
        const priceD18 = sqrtPriceX96ToPriceD18(BigInt(attestation.value));
        const YES_SQRT_X96_PRICE_D18 =
          sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
        const percentageD2 =
          (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
        const percentage = Math.round(Number(percentageD2) / 100);
        const shouldColor = percentage !== 50;
        const isGreen = shouldColor && percentage > 50;
        const isRed = shouldColor && percentage < 50;
        const variant: 'outline' | 'default' = shouldColor
          ? 'outline'
          : 'default';
        const className = shouldColor
          ? isGreen
            ? 'border-green-500/40 bg-green-500/10 text-green-600'
            : isRed
              ? 'border-red-500/40 bg-red-500/10 text-red-600'
              : ''
          : '';
        actionBadge = (
          <Badge variant={variant} className={`${className} whitespace-nowrap`}>
            {`${percentage}% Chance`}
          </Badge>
        );
      }
    } catch {
      actionBadge = null;
    }
    return (
      <tr className="border-b align-middle">
        <td
          className="px-4 py-3 border-l-[4px]"
          style={
            leftColor
              ? {
                  borderLeftColor: leftColor,
                  borderLeftWidth: 4,
                  borderLeftStyle: 'solid',
                }
              : undefined
          }
        >
          <TransactionTimeCell tx={tx} />
        </td>
        <td className="px-4 py-3">
          <TransactionQuestionCell tx={tx} />
        </td>
        <td className="px-4 py-3">
          {actionBadge || <TransactionTypeCell tx={tx} />}
        </td>
        <td className="px-4 py-3">
          <TransactionAmountCell
            tx={tx}
            collateralAssetTicker={collateralAssetTicker || undefined}
            attestation={attestation}
            sortedMarketsForColors={sortedMarketsForColors}
            showForecastBadgesInAmount={false}
          />
        </td>
        <td className="px-4 py-3">
          <TransactionOwnerCell tx={tx} />
        </td>
        <td className="px-4 py-3">
          <TransactionPositionCell
            tx={tx}
            sortedMarketsForColors={sortedMarketsForColors}
            comment={comment}
          />
        </td>
      </tr>
    );
  };
  // Name component for React DevTools
  (ForecastRow as any).displayName = 'ForecastRow';
  return ForecastRow;
}

export default function CombinedFeedTable({
  rows,
  forecasts: forecastsProp,
  minAmount,
  searchQuery,
  address,
}: {
  rows: FeedRow[];
  forecasts?: FormattedAttestation[];
  minAmount?: number | null;
  searchQuery?: string;
  address?: string | null;
}) {
  const { marketGroups } = useSapience();
  const { data: forecastsHook = [] } = useForecasts({});
  const forecasts = forecastsProp ?? forecastsHook;

  const forecastRows: FeedRow[] = useMemo(() => {
    if (!forecasts || forecasts.length === 0) return [];

    const toHex = (id: string | number | null | undefined): string | null => {
      if (id == null) return null;
      const s = String(id);
      if (s.startsWith('0x') || s.startsWith('0X')) return s.toLowerCase();
      const n = Number(s);
      return Number.isFinite(n) ? `0x${n.toString(16)}` : null;
    };

    const mapAttestation = (att: FormattedAttestation): FeedRow | null => {
      const marketAddress = (att.marketAddress || '').toLowerCase();
      const group = marketGroups.find(
        (g) => (g.address || '').toLowerCase() === marketAddress
      );
      if (!group) return null;

      let optionName: string | null = null;
      let marketIdForTx: string | number | null = att.marketId || null;
      // Try to match option by marketId (hex) against group markets
      const hex = toHex(att.marketId || null);
      const sortedMarketsForColors: any[] = Array.isArray(group.markets)
        ? [...group.markets].sort(
            (a: any, b: any) =>
              Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
          )
        : [];
      if (hex && Array.isArray(group.markets)) {
        try {
          const dec = parseInt(hex, 16);
          const match = group.markets.find(
            (m: any) => Number(m?.marketId) === dec
          );
          if (match) {
            optionName = match.shortName ?? match.optionName ?? null;
            marketIdForTx = dec;
          }
        } catch {
          // ignore parse errors
        }
      }

      const createdAtIso = new Date(Number(att.rawTime) * 1000).toISOString();
      const tx: UiTransaction = {
        id: Number(att.id) || Date.now(),
        type: 'FORECAST',
        createdAt: createdAtIso,
        collateral: '0',
        position: {
          owner: att.attester,
          positionId: null,
          isLP: false,
          market: {
            optionName,
            marketId: marketIdForTx,
            marketGroup: {
              chainId: (group as any)?.chainId ?? null,
              address: group.address ?? null,
              question: (group as any)?.question ?? null,
              markets: Array.isArray(group.markets)
                ? group.markets.map((m: any) => ({
                    marketId: Number(m.marketId),
                    shortName: m.shortName ?? m.optionName ?? null,
                  }))
                : [],
            },
          },
        },
      };

      const Comp = createForecastRow(att);
      return {
        Comp,
        key: `forecast-${att.id}`,
        tx,
        collateralAssetTicker: group.collateralSymbol || null,
        sortedMarketsForColors,
      } as FeedRow;
    };

    return forecasts.map(mapAttestation).filter(Boolean) as FeedRow[];
  }, [forecasts, marketGroups]);

  const combinedRows = useMemo(() => {
    // Merge forecasts after transactions; both sorted in FeedTable anyway
    return [...rows, ...forecastRows];
  }, [rows, forecastRows]);

  const filteredRows = useMemo(() => {
    const query = (searchQuery || '').trim().toLowerCase();

    function extractOwnerLower(tx: UiTransaction): string {
      const lowerType = String(tx.type || '').toLowerCase();
      const eventLog: any = (tx as any)?.event?.logData || {};
      const fallbackMaker: string =
        typeof eventLog?.maker === 'string' ? eventLog.maker : '';
      const owner =
        (tx as any)?.position?.owner ||
        (lowerType.includes('mintparlay') ? fallbackMaker : '') ||
        '';
      return owner.toString().toLowerCase();
    }

    function extractAmountNumber(tx: UiTransaction): number {
      try {
        const raw =
          (tx as any)?.collateralTransfer?.collateral ??
          (tx as any)?.position?.collateral ??
          (tx as any)?.collateral;
        const big = BigInt(raw || '0');
        // Convert to token units (ether) and take absolute value for comparison
        const asEther = Number(formatEther(big < 0n ? -big : big));
        return asEther;
      } catch {
        return 0;
      }
    }

    function extractSearchText(tx: UiTransaction): string {
      const lowerType = String(tx.type || '').toLowerCase();
      const normalizedType = lowerType.replace(/[^a-z]/g, '');
      if (normalizedType.includes('mintparlay')) {
        const eventLog: any = (tx as any)?.event?.logData || {};
        const outcomes = Array.isArray(eventLog?.predictedOutcomes)
          ? eventLog.predictedOutcomes
          : [];
        const first = outcomes[0] || {};
        const text =
          first.shortName || first.question || first.conditionId || '';
        return String(text).toLowerCase();
      }
      const q = (tx as any)?.position?.market?.marketGroup?.question || '';
      const opt = (tx as any)?.position?.market?.optionName || '';
      const comment = (tx as any)?.comment || '';
      return `${String(q)} ${String(opt)} ${String(comment)}`.toLowerCase();
    }

    return combinedRows.filter(({ tx }) => {
      // Address filter
      if (address) {
        const owner = extractOwnerLower(tx);
        if (owner !== address.toLowerCase()) return false;
      }

      // Min amount filter (token units)
      if (minAmount != null && Number.isFinite(minAmount)) {
        const value = extractAmountNumber(tx);
        if (value < minAmount) return false;
      }

      // Search filter
      if (query) {
        const text = extractSearchText(tx);
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [combinedRows, minAmount, searchQuery, address]);

  return <FeedTable rows={filteredRows} />;
}
