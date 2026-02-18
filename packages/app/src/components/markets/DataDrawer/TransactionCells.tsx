'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { formatEther } from 'viem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { formatPercentChance } from '~/lib/format/percentChance';
import {
  getSeriesColorByIndex,
  withAlpha,
  CHART_SERIES_COLORS,
} from '~/lib/theme/chartColors';
import { d18ToPercentage } from '~/lib/utils/util';
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
    } | null;
  } | null;
  positionType?: 'LP' | 'Trader';
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
      // Convert D18 to percentage (0-100)
      const percentage = Math.round(d18ToPercentage(attestation.value));
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
          {`${formatPercentChance(percentage / 100)} Chance`}
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
      const shortName = (position?.market as any)?.shortName || '';
      const stableKey = [
        optionName || '',
        shortName || '',
        marketQuestion || '',
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
