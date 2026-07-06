import { isRobinhoodChain } from '@sapience/sdk/constants';
import type { VaultStatPoint } from '~/lib/adapters/vaultStat';
import { PERIOD_DAYS, type Period } from '~/components/shared/PeriodFilter';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

// Vault activity on the Robinhood/Meridian chains starts at the 2026-07-01
// UTC cutover; snapshots before that are a pre-launch tail that would drag
// every period's return anchor (and the ALL view's x-range) into dead
// history, so the charts clamp their visible start here.
export const ROBINHOOD_CHART_START_SEC = Date.UTC(2026, 6, 1) / 1000;

/** Hard lower bound on visible chart history for a chain, if it has one. */
export function chartAnchorSecForChain(chainId: number): number | undefined {
  return isRobinhoodChain(chainId) ? ROBINHOOD_CHART_START_SEC : undefined;
}

// Ceiling for the displayed annualized return. Young vaults with a strong
// week still annualize to silly numbers; past this point the figure carries
// no information, so clamp it.
const MAX_HEADLINE_APY_PCT = 1_000_000;

export type VaultPnlChartPoint = {
  timestamp: number;
  pnl: number;
  tvl: number;
  pnlDelta: number;
  pct: number;
  isReturnAnchor: boolean;
};

type BasePoint = Pick<VaultPnlChartPoint, 'timestamp' | 'pnl' | 'tvl'>;

function findFirstActivePointIndex(points: BasePoint[]): number {
  return points.findIndex((point) => point.tvl > 0);
}

export function buildVaultPnlChartData(
  vaultStats: VaultStatPoint[] | undefined,
  period: Period,
  nowSec = Math.floor(Date.now() / 1000),
  anchorSec?: number
): VaultPnlChartPoint[] {
  if (!vaultStats || vaultStats.length === 0) return [];

  const periodDays = PERIOD_DAYS[period];
  const periodCutoff =
    periodDays === Infinity ? 0 : nowSec - periodDays * ONE_DAY_IN_SECONDS;
  // `anchorSec` is a hard lower bound on visible history (see
  // chartAnchorSecForChain); the period window still applies on top of it.
  const cutoffTimestamp =
    anchorSec !== undefined ? Math.max(periodCutoff, anchorSec) : periodCutoff;

  const filteredPoints: BasePoint[] = vaultStats
    .filter((stat) => stat.timestamp >= cutoffTimestamp)
    .map((stat) => ({
      timestamp: stat.timestamp,
      pnl: stat.pnl,
      tvl: stat.tvl,
    }));

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

  // `pct` is a time-weighted return: each interval's PnL is divided by the
  // TVL at the interval's start, then the (1 + r) factors are chained. This
  // keeps deposits/withdrawals from distorting the return — a deposit grows
  // the base for *later* intervals instead of inflating the whole series
  // against the first snapshot's (possibly tiny) TVL.
  let growth = 1;
  return visiblePoints.map((point, index) => {
    if (index < returnAnchorIndex) {
      return {
        ...point,
        pnlDelta: 0,
        pct: 0,
        isReturnAnchor: false,
      };
    }

    if (index > returnAnchorIndex) {
      const prev = visiblePoints[index - 1];
      // A zero-TVL interval start (full withdrawal) has no capital base to
      // measure against; treat it as flat.
      if (prev.tvl > 0) {
        growth *= 1 + (point.pnl - prev.pnl) / prev.tvl;
      }
    }

    return {
      ...point,
      pnlDelta: point.pnl - returnAnchor.pnl,
      pct: (growth - 1) * 100,
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

  // The last point's `pct` is the chained time-weighted return since the
  // anchor (see buildVaultPnlChartData), so annualization inherits its
  // deposit/withdrawal adjustment.
  const periodReturn = lastPoint.pct / 100;
  if (1 + periodReturn <= 0) return null;

  const daysElapsed = (nowSec - returnAnchor.timestamp) / ONE_DAY_IN_SECONDS;
  if (daysElapsed < 0.5) return null;

  const apy = (Math.pow(1 + periodReturn, 365 / daysElapsed) - 1) * 100;
  return Math.min(apy, MAX_HEADLINE_APY_PCT);
}
