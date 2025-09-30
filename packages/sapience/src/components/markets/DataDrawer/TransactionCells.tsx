'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { formatEther } from 'viem';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import ParlayLegsList from '~/components/shared/ParlayLegsList';
import NumberDisplay from '~/components/shared/NumberDisplay';
import {
  getSeriesColorByIndex,
  withAlpha,
  CHART_SERIES_COLORS,
} from '~/lib/theme/chartColors';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { sqrtPriceX96ToPriceD18, getChainShortName } from '~/lib/utils/util';
import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';

export interface UiTransaction {
  id: number;
  type: string;
  createdAt: string;
  collateral: string;
  collateralTransfer?: { collateral?: string | null } | null;
  event?: { transactionHash?: string | null; logData?: any } | null;
  position?: {
    owner?: string | null;
    positionId?: string | number | null;
    isLP?: boolean | null;
    collateral?: string | null;
    market?: {
      optionName?: string | null;
      marketId?: string | number | null;
      marketGroup?: {
        chainId?: number | null;
        address?: string | null;
        question?: string | null;
        markets?: Array<{
          marketId: number;
          shortName?: string | null;
          question?: string | null;
        }> | null;
      } | null;
    } | null;
  } | null;
  positionType?: 'LP' | 'Trader';
}

function normalizeHexOrDecId(id: any): { dec?: number; hex?: string } {
  if (id == null) return {};
  const s = String(id);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    try {
      const dec = parseInt(s, 16);
      return {
        dec: Number.isFinite(dec) ? dec : undefined,
        hex: s.toLowerCase(),
      };
    } catch {
      return { hex: s.toLowerCase() };
    }
  }
  const dec = Number(s);
  return { dec: Number.isFinite(dec) ? dec : undefined };
}

export function getRowLeftBarColor(
  tx: UiTransaction,
  sortedMarketsForColors: any[]
): string | undefined {
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  if (normalizedType.includes('parlay')) {
    return '#000000';
  }
  // For forecasts, fall through to category color logic below (no special override)
  const position = tx.position || {};
  const optionName = position?.market?.optionName;
  const rawId = position?.market?.marketId;
  const { dec: positionMarketIdNum } = normalizeHexOrDecId(rawId);
  const groupMarketsRaw = (position?.market?.marketGroup?.markets ||
    []) as Array<any>;
  const groupMarketsSorted = Array.isArray(groupMarketsRaw)
    ? [...groupMarketsRaw].sort(
        (a, b) => Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
      )
    : [];

  const candidateLists: Array<any[]> = [];
  if (
    Array.isArray(sortedMarketsForColors) &&
    sortedMarketsForColors.length >= 2
  ) {
    candidateLists.push(sortedMarketsForColors);
  }
  if (groupMarketsSorted.length >= 2) {
    candidateLists.push(groupMarketsSorted);
  }

  const tryFindIndex = (): number => {
    for (const list of candidateLists) {
      if (positionMarketIdNum != null) {
        const idxById = list.findIndex(
          (m: any) => Number(m?.marketId) === positionMarketIdNum
        );
        if (idxById >= 0) return idxById;
      }
      if (optionName) {
        const lowerOpt = String(optionName).toLowerCase();
        const idxByName = list.findIndex((m: any) => {
          const cand = (m?.shortName ??
            m?.optionName ??
            m?.name ??
            '') as string;
          return String(cand).toLowerCase() === lowerOpt;
        });
        if (idxByName >= 0) return idxByName;
      }
    }
    // Stable hash fallback
    const marketQuestion = (position?.market as any)?.question || '';
    const groupQuestion =
      (position?.market?.marketGroup as any)?.question || '';
    const shortName = (position?.market as any)?.shortName || '';
    const stableKey = [
      optionName || '',
      shortName || '',
      marketQuestion || '',
      groupQuestion || '',
    ]
      .map((s) => String(s))
      .join('|');
    if (stableKey) {
      const paletteSize = CHART_SERIES_COLORS.length || 5;
      let hash = 0;
      for (let i = 0; i < stableKey.length; i++) {
        hash = (hash * 31 + stableKey.charCodeAt(i)) | 0;
      }
      return ((hash % paletteSize) + paletteSize) % paletteSize;
    }
    return -1;
  };

  const optionIndex = tryFindIndex();
  const seriesColor =
    optionIndex >= 0 ? getSeriesColorByIndex(optionIndex) : undefined;
  return seriesColor;
}

export function isParlayTransaction(tx: UiTransaction): boolean {
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  return normalizedType.includes('parlay');
}

export function getTransactionTypeDisplay(type: string) {
  switch (type) {
    case 'FORECAST':
    case 'forecast':
      return { label: 'Forecast', variant: 'outline' as const };
    case 'ADD_LIQUIDITY':
    case 'addLiquidity':
      return {
        label: 'Add Liquidity',
        variant: 'outline' as const,
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'REMOVE_LIQUIDITY':
    case 'removeLiquidity':
      return {
        label: 'Remove Liquidity',
        variant: 'outline' as const,
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'LONG':
    case 'long':
      return {
        label: 'Long',
        variant: 'outline' as const,
        className: 'border-green-500/40 bg-green-500/10 text-green-600',
      };
    case 'SHORT':
    case 'short':
      return {
        label: 'Short',
        variant: 'outline' as const,
        className: 'border-red-500/40 bg-red-500/10 text-red-600',
      };
    case 'SETTLE_POSITION':
    case 'settlePosition':
      return { label: 'Settle', variant: 'secondary' as const };
    case 'SETTLED_POSITION':
    case 'settledPosition':
      return { label: 'Settled', variant: 'secondary' as const };
    case 'mintParlayNFTs':
    case 'MINT_PARLAY_NFTS':
      return { label: 'Create Parlay', variant: 'default' as const };
    case 'Parlay':
    case 'parlay':
      return { label: 'Parlay', variant: 'default' as const };
    case 'Anti-Parlay':
    case 'anti-parlay':
      return { label: 'Anti-Parlay', variant: 'outline' as const };
    case 'burnParlayNFTs':
    case 'BURN_PARLAY_NFTS':
      return { label: 'Burn Parlay', variant: 'outline' as const };
    default:
      return { label: type, variant: 'outline' as const };
  }
}

export function TransactionTimeCell({ tx }: { tx: UiTransaction }) {
  const createdDate = new Date(tx.createdAt);
  const createdDisplay = formatDistanceToNow(createdDate, { addSuffix: true });
  const exactLocalDisplay = createdDate.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="whitespace-nowrap font-normal cursor-help">
            {createdDisplay}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div>{exactLocalDisplay}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TransactionTypeCell({ tx }: { tx: UiTransaction }) {
  const typeDisplay = getTransactionTypeDisplay(tx.type);
  const isAntiParlay =
    String(typeDisplay.label || '').toLowerCase() === 'anti-parlay';
  return (
    <div className="flex items-center gap-1">
      <Badge
        variant={typeDisplay.variant}
        className={`${typeDisplay.className ?? ''} whitespace-nowrap`}
      >
        {typeDisplay.label}
      </Badge>
      {isAntiParlay ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Anti-Parlay details"
                className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                This position is that one or more of the conditions in question
                will not be met.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

export function TransactionOwnerCell({ tx }: { tx: UiTransaction }) {
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  const eventLog = (tx.event as any)?.logData || {};
  const fallbackMaker =
    typeof eventLog?.maker === 'string' ? eventLog.maker : '';
  const owner =
    tx.position?.owner ||
    (normalizedType.includes('mintparlay') ? fallbackMaker : '') ||
    '';
  return (
    <div>
      <div className="flex items-center gap-2 min-w-0">
        {owner ? (
          <EnsAvatar
            address={owner}
            className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
            width={16}
            height={16}
          />
        ) : null}
        <div className="[&_span.font-mono]:text-foreground min-w-0">
          <AddressDisplay address={owner} compact />
        </div>
      </div>
    </div>
  );
}

export function TransactionAmountCell({
  tx,
  collateralAssetTicker,
  attestation,
  sortedMarketsForColors,
  showForecastBadgesInAmount = true,
}: {
  tx: UiTransaction;
  collateralAssetTicker?: string | null;
  attestation?: FormattedAttestation;
  sortedMarketsForColors?: any[];
  showForecastBadgesInAmount?: boolean;
}) {
  const collateralRaw =
    tx.collateralTransfer?.collateral ??
    tx.position?.collateral ??
    tx.collateral;
  let amount = 0;
  try {
    amount = collateralRaw ? Number(formatEther(BigInt(collateralRaw))) : 0;
  } catch {
    amount = 0;
  }
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  // Determine direction of flow relative to the protocol
  const flowDirection: 'in' | 'out' | null = (() => {
    if (normalizedType.includes('forecast')) return null;
    // Prefer explicit delta from collateralTransfer if present
    const deltaStr = tx.collateralTransfer?.collateral;
    if (typeof deltaStr === 'string') {
      try {
        const delta = BigInt(deltaStr);
        if (delta > 0n) return 'in';
        if (delta < 0n) return 'out';
      } catch {
        // fall through
      }
    }
    // Fallback to type-based heuristic when delta is unavailable
    if (
      normalizedType.includes('removeliquidity') ||
      normalizedType.includes('settleposition') ||
      normalizedType.includes('settledposition') ||
      normalizedType.includes('burnparlay')
    ) {
      return 'out';
    }
    if (
      normalizedType.includes('addliquidity') ||
      normalizedType.includes('long') ||
      normalizedType.includes('short') ||
      normalizedType.includes('mintparlay') ||
      normalizedType === 'parlay' ||
      normalizedType === 'antiparlay'
    ) {
      return 'in';
    }
    return null;
  })();
  const shouldShowBadgesInAmount =
    showForecastBadgesInAmount && normalizedType.includes('forecast');
  let predictionBadge: React.ReactNode = null;
  if (shouldShowBadgesInAmount && attestation && attestation.value) {
    try {
      const priceD18 = sqrtPriceX96ToPriceD18(BigInt(attestation.value));
      const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
      const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
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
      predictionBadge = (
        <Badge variant={variant} className={`${className} whitespace-nowrap`}>
          {`${percentage}% Chance`}
        </Badge>
      );
    } catch {
      predictionBadge = null;
    }
  }
  const showNaForAmount = normalizedType.includes('forecast') && amount === 0;
  // Build option badge for forecast rows (moved from position cell)
  let optionBadge: React.ReactNode = null;
  if (shouldShowBadgesInAmount) {
    const position = tx.position || {};
    const optionName = position?.market?.optionName;
    const rawId = position?.market?.marketId;
    const groupMarketsRaw = (position?.market?.marketGroup?.markets ||
      []) as Array<any>;
    const groupMarketsSorted = Array.isArray(groupMarketsRaw)
      ? [...groupMarketsRaw].sort(
          (a, b) => Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
        )
      : [];
    const normalizeId = (id: any): { dec?: number; hex?: string } => {
      if (id == null) return {};
      const s = String(id);
      if (s.startsWith('0x') || s.startsWith('0X')) {
        try {
          const dec = parseInt(s, 16);
          return {
            dec: Number.isFinite(dec) ? dec : undefined,
            hex: s.toLowerCase(),
          };
        } catch {
          return { hex: s.toLowerCase() };
        }
      }
      const dec = Number(s);
      return { dec: Number.isFinite(dec) ? dec : undefined };
    };
    const { dec: positionMarketIdNum } = normalizeId(rawId);
    const findOptionIndex = (): number => {
      const tryLists: Array<any[]> = [];
      if (
        Array.isArray(sortedMarketsForColors) &&
        sortedMarketsForColors.length >= 2
      ) {
        tryLists.push(sortedMarketsForColors);
      }
      if (groupMarketsSorted.length >= 2) {
        tryLists.push(groupMarketsSorted);
      }
      for (const list of tryLists) {
        if (positionMarketIdNum != null) {
          const idxById = list.findIndex(
            (m: any) => Number(m?.marketId) === positionMarketIdNum
          );
          if (idxById >= 0) return idxById;
        }
        if (optionName) {
          const lowerOpt = String(optionName).toLowerCase();
          const idxByName = list.findIndex((m: any) => {
            const cand = (m?.shortName ??
              m?.optionName ??
              m?.name ??
              '') as string;
            return String(cand).toLowerCase() === lowerOpt;
          });
          if (idxByName >= 0) return idxByName;
        }
      }
      const marketQuestion = (position?.market as any)?.question || '';
      const groupQuestion =
        (position?.market?.marketGroup as any)?.question || '';
      const shortName = (position?.market as any)?.shortName || '';
      const stableKey = [
        optionName || '',
        shortName || '',
        marketQuestion || '',
        groupQuestion || '',
      ]
        .map((s) => String(s))
        .join('|');
      if (stableKey) {
        const paletteSize = CHART_SERIES_COLORS.length || 5;
        let hash = 0;
        for (let i = 0; i < stableKey.length; i++) {
          hash = (hash * 31 + stableKey.charCodeAt(i)) | 0;
        }
        return ((hash % paletteSize) + paletteSize) % paletteSize;
      }
      return -1;
    };
    const optionIndex = findOptionIndex();
    let seriesColor =
      optionIndex >= 0 ? getSeriesColorByIndex(optionIndex) : undefined;
    if (!seriesColor) {
      const paletteSize = CHART_SERIES_COLORS.length || 5;
      const fallbackKey = String(
        (tx.position?.market?.optionName as any) || positionMarketIdNum || ''
      );
      if (fallbackKey) {
        let hash = 0;
        for (let i = 0; i < fallbackKey.length; i++) {
          hash = (hash * 31 + fallbackKey.charCodeAt(i)) | 0;
        }
        const idx = ((hash % paletteSize) + paletteSize) % paletteSize;
        seriesColor = getSeriesColorByIndex(idx);
      }
    }
    if (optionName) {
      const lower = String(optionName).toLowerCase();
      const yesNoClass =
        lower === 'yes'
          ? 'border-green-500/40 bg-green-500/10 text-green-600'
          : lower === 'no'
            ? 'border-red-500/40 bg-red-500/10 text-red-600'
            : '';
      const useSeriesStyle = yesNoClass === '';
      optionBadge = (
        <Badge
          variant="outline"
          className={`truncate max-w-[220px] ${yesNoClass}`}
          style={
            useSeriesStyle
              ? {
                  backgroundColor: seriesColor
                    ? withAlpha(seriesColor, 0.08)
                    : undefined,
                  borderColor: seriesColor
                    ? withAlpha(seriesColor, 0.24)
                    : undefined,
                  color: seriesColor || undefined,
                }
              : undefined
          }
          title={optionName}
        >
          {optionName}
        </Badge>
      );
    }
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {showNaForAmount ? (
          <span className="text-muted-foreground">N/A</span>
        ) : (
          <>
            <NumberDisplay value={Math.abs(amount)} />
            {collateralAssetTicker ? (
              <span>{collateralAssetTicker}</span>
            ) : null}
            {flowDirection ? (
              <span className="text-muted-foreground size-xs">
                {flowDirection}
              </span>
            ) : null}
          </>
        )}
      </div>
      {optionBadge}
      {predictionBadge}
    </div>
  );
}

export function TransactionPositionCell({
  tx,
  sortedMarketsForColors,
  comment,
  attestation,
}: {
  tx: UiTransaction;
  sortedMarketsForColors: any[];
  comment?: string;
  attestation?: FormattedAttestation;
}) {
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  if (normalizedType.includes('mintparlay')) {
    return <MintParlayPositionCell tx={tx} />;
  }
  const position = tx.position || {};
  const optionName = position?.market?.optionName;
  const rawId = position?.market?.marketId;
  const groupMarketsRaw = (position?.market?.marketGroup?.markets ||
    []) as Array<any>;
  const groupMarketsSorted = Array.isArray(groupMarketsRaw)
    ? [...groupMarketsRaw].sort(
        (a, b) => Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
      )
    : [];
  const normalizeId = (id: any): { dec?: number; hex?: string } => {
    if (id == null) return {};
    const s = String(id);
    if (s.startsWith('0x') || s.startsWith('0X')) {
      try {
        const dec = parseInt(s, 16);
        return {
          dec: Number.isFinite(dec) ? dec : undefined,
          hex: s.toLowerCase(),
        };
      } catch {
        return { hex: s.toLowerCase() };
      }
    }
    const dec = Number(s);
    return { dec: Number.isFinite(dec) ? dec : undefined };
  };
  const { dec: positionMarketIdNum } = normalizeId(rawId);

  const findOptionIndex = (): number => {
    const tryLists: Array<any[]> = [];
    // Prefer provided sorted list when it has at least 2 items (single-item lists force index 0 → blue)
    if (
      Array.isArray(sortedMarketsForColors) &&
      sortedMarketsForColors.length >= 2
    ) {
      tryLists.push(sortedMarketsForColors);
    }
    // Then fallback to markets from the tx's marketGroup when it has at least 2 items
    if (groupMarketsSorted.length >= 2) {
      tryLists.push(groupMarketsSorted);
    }

    for (const list of tryLists) {
      // 1) exact decimal marketId match
      if (positionMarketIdNum != null) {
        const idxById = list.findIndex(
          (m: any) => Number(m?.marketId) === positionMarketIdNum
        );
        if (idxById >= 0) return idxById;
      }
      // 2) name-based match: optionName vs shortName/optionName/name
      if (optionName) {
        const lowerOpt = String(optionName).toLowerCase();
        const idxByName = list.findIndex((m: any) => {
          const cand = (m?.shortName ??
            m?.optionName ??
            m?.name ??
            '') as string;
          return String(cand).toLowerCase() === lowerOpt;
        });
        if (idxByName >= 0) return idxByName;
      }
    }

    // 3) stable hash fallback using shortName/question/optionName
    const marketQuestion = (position?.market as any)?.question || '';
    const groupQuestion =
      (position?.market?.marketGroup as any)?.question || '';
    const shortName = (position?.market as any)?.shortName || '';
    const stableKey = [
      optionName || '',
      shortName || '',
      marketQuestion || '',
      groupQuestion || '',
    ]
      .map((s) => String(s))
      .join('|');
    if (stableKey) {
      const paletteSize = CHART_SERIES_COLORS.length || 5;
      let hash = 0;
      for (let i = 0; i < stableKey.length; i++) {
        hash = (hash * 31 + stableKey.charCodeAt(i)) | 0;
      }
      return ((hash % paletteSize) + paletteSize) % paletteSize;
    }
    return -1;
  };
  const optionIndex = findOptionIndex();
  let seriesColor =
    optionIndex >= 0 ? getSeriesColorByIndex(optionIndex) : undefined;
  if (!seriesColor) {
    // Final fallback: hash optionName alone or marketId modulo palette to avoid defaulting to index 0
    const paletteSize = CHART_SERIES_COLORS.length || 5;
    const fallbackKey = String(optionName || positionMarketIdNum || '');
    if (fallbackKey) {
      let hash = 0;
      for (let i = 0; i < fallbackKey.length; i++) {
        hash = (hash * 31 + fallbackKey.charCodeAt(i)) | 0;
      }
      const idx = ((hash % paletteSize) + paletteSize) % paletteSize;
      seriesColor = getSeriesColorByIndex(idx);
    }
  }
  // Removed Trader/Liquidity badge; liquidity flag no longer needed here

  // For forecast rows, render option and chance badges first, inline with the comment
  if (normalizedType.includes('forecast')) {
    let optionBadge: React.ReactNode = null;
    if (optionName) {
      const lower = String(optionName).toLowerCase();
      const yesNoClass =
        lower === 'yes'
          ? 'border-green-500/40 bg-green-500/10 text-green-600'
          : lower === 'no'
            ? 'border-red-500/40 bg-red-500/10 text-red-600'
            : '';
      const useSeriesStyle = yesNoClass === '';
      optionBadge = (
        <Badge
          variant="outline"
          className={`shrink-0 truncate max-w-[220px] ${yesNoClass}`}
          style={
            useSeriesStyle
              ? {
                  backgroundColor: seriesColor
                    ? withAlpha(seriesColor, 0.08)
                    : undefined,
                  borderColor: seriesColor
                    ? withAlpha(seriesColor, 0.24)
                    : undefined,
                  color: seriesColor || undefined,
                }
              : undefined
          }
          title={optionName}
        >
          {optionName}
        </Badge>
      );
    }

    let predictionBadge: React.ReactNode = null;
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
        predictionBadge = (
          <Badge
            variant={variant}
            className={`${className} whitespace-nowrap shrink-0`}
          >
            {`${percentage}% Chance`}
          </Badge>
        );
      }
    } catch {
      predictionBadge = null;
    }

    return (
      <div>
        <div className="flex items-center gap-2 min-w-0">
          {optionBadge}
          {predictionBadge}
          {comment ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="text-sm text-foreground/90 tracking-[-0.005em] truncate cursor-help block flex-1 min-w-0"
                    title={comment}
                  >
                    {comment}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xl">
                  <p className="break-words max-w-xl">{comment}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        {position?.positionId ? (
          <span className="whitespace-nowrap">#{position.positionId}</span>
        ) : null}
        {/* Removed Trader/Liquidity badge */}
        {!normalizedType.includes('forecast') && optionName
          ? (() => {
              const lower = String(optionName).toLowerCase();
              const yesNoClass =
                lower === 'yes'
                  ? 'border-green-500/40 bg-green-500/10 text-green-600'
                  : lower === 'no'
                    ? 'border-red-500/40 bg-red-500/10 text-red-600'
                    : '';
              const useSeriesStyle = yesNoClass === '';
              return (
                <Badge
                  variant="outline"
                  className={`truncate max-w-[220px] ${yesNoClass}`}
                  style={
                    useSeriesStyle
                      ? {
                          backgroundColor: seriesColor
                            ? withAlpha(seriesColor, 0.08)
                            : undefined,
                          borderColor: seriesColor
                            ? withAlpha(seriesColor, 0.24)
                            : undefined,
                          color: seriesColor || undefined,
                        }
                      : undefined
                  }
                  title={optionName}
                >
                  {optionName}
                </Badge>
              );
            })()
          : null}
      </div>
    </div>
  );
}

export function TransactionQuestionCell({ tx }: { tx: UiTransaction }) {
  const lowerType = String(tx.type || '').toLowerCase();
  const normalizedType = lowerType.replace(/[^a-z]/g, '');
  if (normalizedType.includes('parlay')) {
    const logData: any = (tx.event as any)?.logData || {};
    const outcomes: Array<any> = Array.isArray(logData?.predictedOutcomes)
      ? logData.predictedOutcomes
      : [];
    if (outcomes.length > 0) {
      const legs = outcomes.map((o) => ({
        shortName: o?.condition?.shortName ?? null,
        question: o?.condition?.question ?? null,
        conditionId: o?.conditionId ?? null,
        choice: o?.prediction ? ('Yes' as const) : ('No' as const),
      }));
      return (
        <div className="space-y-1">
          <ParlayLegsList
            legs={legs}
            layout="row"
            maxWidthClass="max-w-[320px]"
          />
        </div>
      );
    }
    // Fallback when legs are unavailable on the event
    return (
      <span className="font-medium truncate max-w-[320px] block">Parlay</span>
    );
  }
  const questionText =
    (tx.position?.market?.marketGroup?.question as any) || '';
  return questionText ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {(() => {
            const chainId =
              (tx.position?.market?.marketGroup?.chainId as any) ?? null;
            const address =
              (tx.position?.market?.marketGroup?.address as any) || '';
            const hasLink = Number.isFinite(Number(chainId)) && !!address;
            if (!hasLink) {
              return (
                <span className="font-medium truncate max-w-[320px] block cursor-help">
                  {String(questionText)}
                </span>
              );
            }
            const chainShortName = getChainShortName(Number(chainId));
            const param = `${chainShortName}:${address}`;
            const href = `/markets/${encodeURIComponent(param)}`;
            return (
              <Link
                href={href}
                className="font-medium truncate max-w-[320px] block border-b border-border/50 hover:border-border/70 transition-colors cursor-pointer"
                aria-label="View market group"
                title={String(questionText)}
              >
                {String(questionText)}
              </Link>
            );
          })()}
        </TooltipTrigger>
        <TooltipContent className="max-w-xl">
          <p className="break-words max-w-xl">{String(questionText)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function TransactionRow({
  tx,
  collateralAssetTicker,
  sortedMarketsForColors,
}: {
  tx: UiTransaction;
  collateralAssetTicker?: string | null;
  sortedMarketsForColors: any[];
}) {
  const isParlay = isParlayTransaction(tx);
  const leftColor = isParlay
    ? undefined
    : getRowLeftBarColor(tx, sortedMarketsForColors);
  return (
    <motion.tr
      className="border-b align-middle"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      layout
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <td
        className={`px-4 py-3 ${isParlay ? 'border-l-[4px] border-l-black dark:border-l-white' : ''}`}
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
        <TransactionTypeCell tx={tx} />
      </td>
      <td className="px-4 py-3">
        <TransactionAmountCell
          tx={tx}
          collateralAssetTicker={collateralAssetTicker}
        />
      </td>
      <td className="px-4 py-3">
        <TransactionOwnerCell tx={tx} />
      </td>
      <td className="px-4 py-3">
        <TransactionPositionCell
          tx={tx}
          sortedMarketsForColors={sortedMarketsForColors}
        />
      </td>
    </motion.tr>
  );
}

function MintParlayPositionCell({ tx }: { tx: UiTransaction }) {
  const eventLog = (tx.event as any)?.logData || {};
  const taker: string =
    typeof eventLog?.taker === 'string' ? eventLog.taker : '';
  const makerNftTokenId = eventLog?.makerNftTokenId;
  const takerNftTokenId = eventLog?.takerNftTokenId;
  const positionId = tx.position?.positionId;
  // Prefer tokenId match to determine side; fallback to address comparisons
  const positionIdStr = positionId != null ? String(positionId) : '';
  const makerIdStr = makerNftTokenId != null ? String(makerNftTokenId) : '';
  const takerIdStr = takerNftTokenId != null ? String(takerNftTokenId) : '';
  const matchesTakerId =
    positionIdStr && takerIdStr && positionIdStr === takerIdStr;
  const matchesMakerId =
    positionIdStr && makerIdStr && positionIdStr === makerIdStr;
  const ownerAddr = String(tx.position?.owner || '').toLowerCase();
  const isTakerOwnerByAddr =
    taker && ownerAddr && ownerAddr === String(taker).toLowerCase();
  const isTakerOwner =
    matchesTakerId || (!matchesMakerId && isTakerOwnerByAddr);
  const tokenId = isTakerOwner ? takerNftTokenId : makerNftTokenId;
  return (
    <div>
      <div className="flex items-center gap-2">
        {tokenId ? <span className="whitespace-nowrap">#{tokenId}</span> : null}
        {/* Anti-Parlay help icon moved to Action cell; nothing extra here now */}
      </div>
    </div>
  );
}

export function MintParlayNFTTransactionRow({
  tx,
  sortedMarketsForColors,
  collateralAssetTicker,
}: {
  tx: UiTransaction;
  sortedMarketsForColors: any[];
  collateralAssetTicker?: string | null;
}) {
  const isParlay = isParlayTransaction(tx);
  const leftColor = isParlay
    ? undefined
    : getRowLeftBarColor(tx, sortedMarketsForColors);
  return (
    <motion.tr
      className="border-b align-middle"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      layout
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <td
        className={`px-4 py-3 ${isParlay ? 'border-l-[4px] border-l-black dark:border-l-white' : ''}`}
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
        <TransactionTypeCell tx={tx} />
      </td>
      <td className="px-4 py-3">
        <TransactionAmountCell
          tx={tx}
          collateralAssetTicker={collateralAssetTicker ?? undefined}
        />
      </td>
      <td className="px-4 py-3">
        <TransactionOwnerCell tx={tx} />
      </td>
      <td className="px-4 py-3">
        <MintParlayPositionCell tx={tx} />
      </td>
    </motion.tr>
  );
}

export function BurnParlayNFTTransactionRow(
  props: Parameters<typeof TransactionRow>[0]
) {
  return <TransactionRow {...props} />;
}
