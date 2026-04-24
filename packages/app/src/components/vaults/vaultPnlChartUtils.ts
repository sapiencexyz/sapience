import type { ProtocolStat } from '~/hooks/graphql/useAnalytics';
import { PERIOD_DAYS, type Period } from '~/components/shared/PeriodFilter';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

export type VaultPnlChartPoint = {
  timestamp: number;
  pnl: number;
  tvl: number;
  pnlDelta: number;
  pct: number;
  isReturnAnchor: boolean;
};

type BasePoint = Pick<VaultPnlChartPoint, 'timestamp' | 'pnl' | 'tvl'>;

function mapProtocolStatToPoint(point: ProtocolStat): BasePoint {
  return {
    timestamp: point.timestamp,
    pnl: point.vaultCumulativePnL
      ? parseFloat(point.vaultCumulativePnL) / 1e18
      : 0,
    tvl:
      (parseFloat(point.vaultBalance) + parseFloat(point.escrowBalance)) / 1e18,
  };
}

function findFirstActivePointIndex(points: BasePoint[]): number {
  return points.findIndex((point) => point.tvl > 0);
}

export function buildVaultPnlChartData(
  protocolStats: ProtocolStat[] | undefined,
  period: Period,
  nowSec = Math.floor(Date.now() / 1000),
  anchorSec?: number
): VaultPnlChartPoint[] {
  if (!protocolStats || protocolStats.length === 0) return [];

  const periodDays = PERIOD_DAYS[period];
  const periodCutoff =
    periodDays === Infinity ? 0 : nowSec - periodDays * ONE_DAY_IN_SECONDS;
  const cutoffTimestamp =
    anchorSec !== undefined ? Math.max(periodCutoff, anchorSec) : periodCutoff;

  const filteredPoints = protocolStats
    .filter((stat) => stat.timestamp >= cutoffTimestamp)
    .map(mapProtocolStatToPoint);

  if (filteredPoints.length === 0) return [];

  const firstActivePointIndex = findFirstActivePointIndex(filteredPoints);

  if (firstActivePointIndex === -1) {
    return filteredPoints.map((point) => ({
      ...point,
      pnlDelta: 0,
      pct: 0,
      isReturnAnchor: false,
    }));
  }

  const sliceStart = Math.max(0, firstActivePointIndex - 1);
  const returnAnchorIndex = firstActivePointIndex - sliceStart;
  const visiblePoints = filteredPoints.slice(sliceStart);
  const returnAnchor = visiblePoints[returnAnchorIndex];

  return visiblePoints.map((point, index) => {
    if (index < returnAnchorIndex) {
      return {
        ...point,
        pnlDelta: 0,
        pct: 0,
        isReturnAnchor: false,
      };
    }

    const pnlDelta = point.pnl - returnAnchor.pnl;
    const pct = returnAnchor.tvl > 0 ? (pnlDelta / returnAnchor.tvl) * 100 : 0;

    return {
      ...point,
      pnlDelta,
      pct,
      isReturnAnchor: index === returnAnchorIndex,
    };
  });
}

export function computeVaultPnlYDomain(
  values: number[],
  displayMode: 'pct' | 'abs'
): [number, number] {
  if (values.length === 0) return [-1, 1];

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  const padding = range * 0.1 || (displayMode === 'pct' ? 0.01 : 0.1);

  // Anchor the baseline at zero when the series never goes negative so gains
  // read against a stable floor instead of a floating one that hides scale.
  const bottom = minVal >= 0 ? 0 : minVal - padding;
  return [bottom, maxVal + padding];
}

export function calculateVaultPnlHeadlineApy(
  chartData: VaultPnlChartPoint[],
  nowSec = Math.floor(Date.now() / 1000)
): number | null {
  if (chartData.length < 2) return null;

  const returnAnchor =
    chartData.find((point) => point.isReturnAnchor) ?? chartData[0];
  const lastPoint = chartData[chartData.length - 1];

  if (returnAnchor.tvl <= 0) return null;

  const periodReturn = lastPoint.pnlDelta / returnAnchor.tvl;
  if (1 + periodReturn <= 0) return null;

  const daysElapsed = (nowSec - returnAnchor.timestamp) / ONE_DAY_IN_SECONDS;
  if (daysElapsed < 0.5) return null;

  return (Math.pow(1 + periodReturn, 365 / daysElapsed) - 1) * 100;
}
