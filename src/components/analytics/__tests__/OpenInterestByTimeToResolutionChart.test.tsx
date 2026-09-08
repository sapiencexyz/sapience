import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Recharts: prop-capturing div stubs; BarChart records its `data` prop.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({
    data,
    children,
  }: {
    data?: unknown;
    children?: React.ReactNode;
  }) => (
    <div data-testid="bar-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div data-testid="loader" />;
  return { __esModule: true, default: Loader };
});

const mockUseProtocolAnalytics = vi.fn();
vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useProtocolAnalytics: () => mockUseProtocolAnalytics(),
}));

import OpenInterestByTimeToResolutionChart, {
  formatBucketLabel,
} from '~/components/analytics/OpenInterestByTimeToResolutionChart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 86400;
const MONTH = 30 * DAY;
const WEI = 10n ** 18n;

function bucket(
  minSecondsFromNow: number | null,
  maxSecondsFromNow: number | null,
  tokens: bigint,
  predictionCount: number
) {
  return {
    minSecondsFromNow,
    maxSecondsFromNow,
    openInterest: (tokens * WEI).toString(),
    predictionCount,
  };
}

function loaded(openInterestByTimeToResolution: unknown[]) {
  mockUseProtocolAnalytics.mockReturnValue({
    data: {
      stats: null,
      statsHistory: [],
      openInterestByCategory: [],
      openInterestByTimeToResolution,
    },
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// formatBucketLabel — pins the (min, max] bucket-bound labelling
// ---------------------------------------------------------------------------

describe('formatBucketLabel', () => {
  it('labels the current server buckets exactly', () => {
    expect(formatBucketLabel(null, DAY)).toBe('≤1 day');
    expect(formatBucketLabel(DAY, 7 * DAY)).toBe('2-7 days');
    expect(formatBucketLabel(7 * DAY, 30 * DAY)).toBe('8-30 days');
    expect(formatBucketLabel(30 * DAY, 60 * DAY)).toBe('1-2 mo.');
    expect(formatBucketLabel(60 * DAY, 90 * DAY)).toBe('2-3 mo.');
    expect(formatBucketLabel(90 * DAY, 180 * DAY)).toBe('3-6 mo.');
    expect(formatBucketLabel(180 * DAY, null)).toBe('6 mo.+');
  });

  it('labels an unbounded bucket as All', () => {
    expect(formatBucketLabel(null, null)).toBe('All');
  });

  it('labels an open-ended tail in days when min is not month-aligned', () => {
    expect(formatBucketLabel(100 * DAY, null)).toBe('100+ days');
    // Month-aligned tails read in months.
    expect(formatBucketLabel(2 * MONTH, null)).toBe('2 mo.+');
  });

  it('labels a first bucket wider than a day with a day count', () => {
    expect(formatBucketLabel(null, 3 * DAY)).toBe('≤3 days');
  });
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('OpenInterestByTimeToResolutionChart', () => {
  it('shows a loader while analytics load', () => {
    mockUseProtocolAnalytics.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<OpenInterestByTimeToResolutionChart />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('shows the empty state when every bucket is zero', () => {
    loaded([bucket(null, DAY, 0n, 0), bucket(DAY, 7 * DAY, 0n, 0)]);
    render(<OpenInterestByTimeToResolutionChart />);

    expect(screen.getByText('No active open interest.')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no buckets at all', () => {
    loaded([]);
    render(<OpenInterestByTimeToResolutionChart />);

    expect(screen.getByText('No active open interest.')).toBeInTheDocument();
  });

  it('maps buckets to bar data with 1-based indexes, labels and token values', () => {
    loaded([
      bucket(null, DAY, 1_500n, 3),
      bucket(DAY, 7 * DAY, 0n, 0),
      bucket(180 * DAY, null, 42n, 1),
    ]);
    render(<OpenInterestByTimeToResolutionChart />);

    const data = JSON.parse(
      screen.getByTestId('bar-chart').getAttribute('data-chart')!
    );
    expect(data).toEqual([
      { bucket: 1, label: '≤1 day', value: 1500, predictionCount: 3 },
      { bucket: 2, label: '2-7 days', value: 0, predictionCount: 0 },
      { bucket: 3, label: '6 mo.+', value: 42, predictionCount: 1 },
    ]);
  });
});
