import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Recharts: prop-capturing div stubs so tests can assert the exact data
// series handed to each chart without a canvas/layout engine.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({
    data,
    children,
  }: {
    data?: unknown;
    children?: React.ReactNode;
  }) => (
    <div data-testid="area-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  ComposedChart: ({
    data,
    children,
  }: {
    data?: unknown;
    children?: React.ReactNode;
  }) => (
    <div data-testid="composed-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: () => <div />,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('~/lib/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
  COLLATERAL_SYMBOLS: { 42161: 'USDe' },
}));

// Radix popover fights jsdom portals; render trigger/content inline.
vi.mock('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div data-testid="loader" />;
  return { __esModule: true, default: Loader };
});

// Period switching is out of scope; the default '1M' state drives the data.
vi.mock('~/components/shared/PeriodFilter', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/components/shared/PeriodFilter')>();
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="period-filter" />,
  };
});

// The two OI distribution charts fetch on their own; covered by their own tests.
vi.mock('~/components/analytics/OpenInterestByCategoryChart', () => ({
  __esModule: true,
  default: () => <div data-testid="oi-by-category" />,
}));
vi.mock('~/components/analytics/OpenInterestByTimeToResolutionChart', () => ({
  __esModule: true,
  default: () => <div data-testid="oi-by-ttr" />,
}));

const mockUseProtocolAnalytics = vi.fn();
vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useProtocolAnalytics: () => mockUseProtocolAnalytics(),
}));

import AnalyticsPageContent from '~/components/analytics/pages/AnalyticsPageContent';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 86400;
// A recent, boundary-safe UTC day start: "yesterday", so both snapshots land
// on the same UTC day regardless of when the test runs, well inside 1M.
const dayStart = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;

function makeStat(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: dayStart + 100,
    cumulativeVolume: '5000000000000000000000', // 5,000
    cumulativeTradeCount: 12345,
    periodVolume: '100000000000000000000', // 100
    periodTradeCount: 3,
    openInterest: '2500000000000000000000', // 2,500
    escrowBalance: '1500000000000000000000', // 1,500
    totalValueLocked: '4200000000000000000000', // 4,200
    ...overrides,
  };
}

function loaded(analytics: unknown) {
  mockUseProtocolAnalytics.mockReturnValue({
    data: analytics,
    isLoading: false,
  });
}

function locale(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsPageContent', () => {
  it('renders loaders for every summary card and chart while loading', () => {
    mockUseProtocolAnalytics.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<AnalyticsPageContent />);

    // 4 summary cards + 4 charts (Daily Volume / Daily Trades / OI / TVL).
    expect(screen.getAllByTestId('loader')).toHaveLength(8);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('renders the formatted live stats in the summary cards', () => {
    loaded({
      stats: makeStat(),
      statsHistory: [makeStat()],
      openInterestByCategory: [],
      openInterestByTimeToResolution: [],
    });
    render(<AnalyticsPageContent />);

    // 'Protocol TVL' / 'Open Interest' also title their history charts.
    expect(screen.getAllByText('Protocol TVL')).toHaveLength(2);
    expect(screen.getByText(`${locale(4200)} USDe`)).toBeInTheDocument();

    expect(screen.getAllByText('Open Interest')).toHaveLength(2);
    expect(screen.getByText(`${locale(2500)} USDe`)).toBeInTheDocument();

    expect(screen.getByText('Cumulative Volume')).toBeInTheDocument();
    expect(screen.getByText(`${locale(5000)} USDe`)).toBeInTheDocument();

    expect(screen.getByText('Total Trades')).toBeInTheDocument();
    expect(screen.getByText((12345).toLocaleString())).toBeInTheDocument();
  });

  it('breaks TVL down into escrow balance and undeployed vault funds', () => {
    loaded({
      stats: makeStat(),
      statsHistory: [makeStat()],
      openInterestByCategory: [],
      openInterestByTimeToResolution: [],
    });
    render(<AnalyticsPageContent />);

    expect(screen.getByText('Escrow Balance')).toBeInTheDocument();
    expect(screen.getByText(`${locale(1500)} USDe`)).toBeInTheDocument();
    // undeployed = totalValueLocked - escrowBalance = 4200 - 1500 = 2700
    expect(screen.getByText('Undeployed Vault Funds')).toBeInTheDocument();
    expect(screen.getByText(`${locale(2700)} USDe`)).toBeInTheDocument();
  });

  it('shows the empty state for all four history charts when there is no history', () => {
    loaded({
      stats: makeStat(),
      statsHistory: [],
      openInterestByCategory: [],
      openInterestByTimeToResolution: [],
    });
    render(<AnalyticsPageContent />);

    expect(screen.getAllByText('No data available')).toHaveLength(4);
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
  });

  it('mounts the two open-interest distribution charts', () => {
    loaded({
      stats: makeStat(),
      statsHistory: [],
      openInterestByCategory: [],
      openInterestByTimeToResolution: [],
    });
    render(<AnalyticsPageContent />);

    expect(screen.getByTestId('oi-by-category')).toBeInTheDocument();
    expect(screen.getByTestId('oi-by-ttr')).toBeInTheDocument();
  });

  it('buckets sub-daily snapshots into one UTC day per chart point', () => {
    // Two snapshots on the same UTC day.
    const early = makeStat({
      timestamp: dayStart + 100,
      periodVolume: '100000000000000000000', // 100
      periodTradeCount: 3,
      openInterest: '1000000000000000000000', // 1,000
      totalValueLocked: '2000000000000000000000', // 2,000
    });
    const late = makeStat({
      timestamp: dayStart + 5000,
      periodVolume: '50000000000000000000', // 50
      periodTradeCount: 2,
      openInterest: '1100000000000000000000', // 1,100
      totalValueLocked: '2200000000000000000000', // 2,200
    });
    loaded({
      stats: makeStat(),
      statsHistory: [early, late],
      openInterestByCategory: [],
      openInterestByTimeToResolution: [],
    });
    render(<AnalyticsPageContent />);

    // Bars (flows) SUM within the day: volume, then trade count.
    const [volumeChart, tradesChart] = screen.getAllByTestId('composed-chart');
    expect(JSON.parse(volumeChart.getAttribute('data-chart')!)).toEqual([
      { timestamp: dayStart, volume: 150 },
    ]);
    expect(JSON.parse(tradesChart.getAttribute('data-chart')!)).toEqual([
      { timestamp: dayStart, tradeCount: 5 },
    ]);

    // Areas (stocks) keep the LAST observation of the day: OI, then TVL.
    const [oiChart, tvlChart] = screen.getAllByTestId('area-chart');
    expect(JSON.parse(oiChart.getAttribute('data-chart')!)).toEqual([
      { timestamp: dayStart, openInterest: 1100, protocolTvl: 2200 },
    ]);
    expect(JSON.parse(tvlChart.getAttribute('data-chart')!)).toEqual([
      { timestamp: dayStart, openInterest: 1100, protocolTvl: 2200 },
    ]);
  });
});
