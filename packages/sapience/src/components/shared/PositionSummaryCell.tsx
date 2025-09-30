'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

import type { PositionType } from '@sapience/ui/types';
import {
  CHART_SERIES_COLORS,
  getSeriesColorByIndex,
  withAlpha,
} from '~/lib/theme/chartColors';

interface PositionSummaryCellProps {
  position: PositionType;
  /**
   * List of markets used to derive a stable color index. Should be sorted consistently
   * (e.g., by marketId asc) to match charts and other components.
   */
  sortedMarketsForColors?: Array<any>;
  /** When false, the option badge is suppressed even if optionName exists */
  showOptionBadge?: boolean;
}

export default function PositionSummaryCell({
  position,
  sortedMarketsForColors = [],
  showOptionBadge = true,
}: PositionSummaryCellProps) {
  const optionName = position.market?.optionName;
  const rawId = position.market?.marketId;
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
    if (positionMarketIdNum != null) {
      const idx = sortedMarketsForColors.findIndex(
        (m: any) => Number(m?.marketId) === positionMarketIdNum
      );
      if (idx >= 0) return idx;
    }
    if (optionName) {
      const idx = sortedMarketsForColors.findIndex(
        (m: any) => (m?.optionName ?? '') === optionName
      );
      if (idx >= 0) return idx;
    }
    if (optionName) {
      const paletteSize = CHART_SERIES_COLORS.length || 5;
      let hash = 0;
      for (let i = 0; i < optionName.length; i++) {
        hash = (hash * 31 + optionName.charCodeAt(i)) | 0;
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
    const idNum = Number(positionMarketIdNum ?? 0);
    const fallbackIndex = ((idNum % paletteSize) + paletteSize) % paletteSize;
    seriesColor = getSeriesColorByIndex(fallbackIndex);
  }

  const createdAtStr = (position as PositionType & { createdAt?: string })
    .createdAt;
  const createdMs = createdAtStr ? new Date(createdAtStr).getTime() : 0;
  const createdDisplay =
    Number.isFinite(createdMs) && createdMs > 0
      ? formatDistanceToNow(new Date(createdMs), { addSuffix: true })
      : '';

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-medium">
          Position #
          {
            (position as PositionType & { positionId?: number | string })
              .positionId
          }
        </span>
        {showOptionBadge && optionName
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
      {createdDisplay ? (
        <div className="text-sm text-muted-foreground mt-0.5">
          created {createdDisplay}
        </div>
      ) : null}
    </div>
  );
}
