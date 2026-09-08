import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Recharts: prop-capturing div stubs. The Pie stub records its `data` prop so
// tests can assert the exact slice series.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Pie: ({ data, children }: { data?: unknown; children?: React.ReactNode }) => (
    <div data-testid="pie" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill?: string }) => (
    <div data-testid="cell" data-fill={fill} />
  ),
}));

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div data-testid="loader" />;
  return { __esModule: true, default: Loader };
});

const mockUseProtocolAnalytics = vi.fn();
vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useProtocolAnalytics: () => mockUseProtocolAnalytics(),
}));

// market-helpers drags in the create-position context and market row widgets;
// the chart only needs the two pure helpers, reimplemented faithfully here:
// collapsePriceCategories merges `prices-*` rows into one 'Prices' aggregate.
vi.mock('~/components/markets/market-helpers', () => ({
  getCategoryColor: (slug?: string | null) => `color-${slug ?? 'none'}`,
  collapsePriceCategories: (
    rows: { slug: string; name: string; raw: bigint }[]
  ) => {
    const priceParts = rows.filter((r) => r.slug.startsWith('prices-'));
    const rest = rows.map((r) => ({ ...r }));
    if (priceParts.length === 0) return rest;
    return [
      ...rest.filter((r) => !r.slug.startsWith('prices-')),
      {
        slug: 'prices',
        name: 'Prices',
        raw: priceParts.reduce((acc, r) => acc + r.raw, 0n),
      },
    ];
  },
}));

vi.mock('~/lib/theme/categoryIcons', () => ({
  getCategoryIcon: () => () => <svg data-testid="category-icon" />,
}));

import OpenInterestByCategoryChart from '~/components/analytics/OpenInterestByCategoryChart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WEI = 10n ** 18n;

function category(slug: string, name: string, tokens: bigint) {
  return {
    category: { slug, name },
    openInterest: (tokens * WEI).toString(),
  };
}

function loaded(openInterestByCategory: unknown[]) {
  mockUseProtocolAnalytics.mockReturnValue({
    data: {
      stats: null,
      statsHistory: [],
      openInterestByCategory,
      openInterestByTimeToResolution: [],
    },
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenInterestByCategoryChart', () => {
  it('shows a loader while analytics load', () => {
    mockUseProtocolAnalytics.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<OpenInterestByCategoryChart />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByTestId('pie')).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no category open interest', () => {
    loaded([]);
    render(<OpenInterestByCategoryChart />);

    expect(screen.getByText('No open interest yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('pie')).not.toBeInTheDocument();
  });

  it('renders a legend sorted by OI descending with toFixed(1) percentages', () => {
    loaded([
      category('sports', 'Sports', 300n),
      category('crypto', 'Crypto', 600n),
      category('weather', 'Weather', 100n),
    ]);
    render(<OpenInterestByCategoryChart />);

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Crypto60.0%',
      'Sports30.0%',
      'Weather10.0%',
    ]);
  });

  it('collapses prices-* categories into a single Prices slice', () => {
    loaded([
      category('crypto', 'Crypto', 600n),
      category('prices-crypto', 'Prices (Crypto)', 250n),
      category('prices-equity', 'Prices (Equity)', 150n),
    ]);
    render(<OpenInterestByCategoryChart />);

    const rows = screen.getAllByRole('listitem');
    // 250 + 150 = 400 of 1000 total → one merged 40.0% 'Prices' row.
    expect(rows.map((r) => r.textContent)).toEqual([
      'Crypto60.0%',
      'Prices40.0%',
    ]);
    expect(screen.queryByText('Prices (Crypto)')).not.toBeInTheDocument();
    expect(screen.queryByText('Prices (Equity)')).not.toBeInTheDocument();
  });

  it('passes the slice values (in tokens) to the pie', () => {
    loaded([
      category('crypto', 'Crypto', 600n),
      category('sports', 'Sports', 400n),
    ]);
    render(<OpenInterestByCategoryChart />);

    const data = JSON.parse(
      screen.getByTestId('pie').getAttribute('data-chart')!
    );
    expect(data).toEqual([
      {
        name: 'Crypto',
        slug: 'crypto',
        color: 'color-crypto',
        value: 600,
        percent: 60,
      },
      {
        name: 'Sports',
        slug: 'sports',
        color: 'color-sports',
        value: 400,
        percent: 40,
      },
    ]);
    // One <Cell> per slice.
    expect(screen.getAllByTestId('cell')).toHaveLength(2);
  });

  it('drops slices that would render as 0.0% in the legend', () => {
    // 1 of 10001 → ~0.0099% < the 0.05% cutoff.
    loaded([
      category('crypto', 'Crypto', 10_000n),
      category('sports', 'Sports', 1n),
    ]);
    render(<OpenInterestByCategoryChart />);

    expect(screen.queryByText('Sports')).not.toBeInTheDocument();
    const data = JSON.parse(
      screen.getByTestId('pie').getAttribute('data-chart')!
    );
    expect(data).toHaveLength(1);
    expect(data[0].slug).toBe('crypto');
  });
});
