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
  const positionMarketIdNum = Number(position.market?.marketId);

  let optionIndex = sortedMarketsForColors.findIndex(
    (m: any) => Number(m?.marketId) === positionMarketIdNum
  );
  if (optionIndex < 0 && optionName) {
    optionIndex = sortedMarketsForColors.findIndex(
      (m: any) => (m?.optionName ?? '') === optionName
    );
  }

  let seriesColor =
    optionIndex >= 0 ? getSeriesColorByIndex(optionIndex) : undefined;
  if (!seriesColor) {
    const paletteSize = CHART_SERIES_COLORS.length || 5;
    const idNum = Number(positionMarketIdNum);
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
        {showOptionBadge && optionName ? (
          <Badge
            variant="outline"
            className="truncate max-w-[220px]"
            style={{
              backgroundColor: seriesColor
                ? withAlpha(seriesColor, 0.08)
                : undefined,
              borderColor: seriesColor
                ? withAlpha(seriesColor, 0.24)
                : undefined,
              color: seriesColor || undefined,
            }}
            title={optionName}
          >
            {optionName}
          </Badge>
        ) : null}
      </div>
      {createdDisplay ? (
        <div className="text-sm text-muted-foreground mt-0.5">
          created {createdDisplay}
        </div>
      ) : null}
    </div>
  );
}
