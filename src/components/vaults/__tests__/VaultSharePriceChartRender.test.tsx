import { vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('~/lib/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
  COLLATERAL_SYMBOLS: { 42161: 'USDe' },
  isRobinhoodChain: () => false,
}));

vi.mock('~/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock('~/components/shared/SegmentedTabsList', () => {
  const SegmentedTabsList = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );
  return { __esModule: true, default: SegmentedTabsList };
});

vi.mock('~/components/shared/Loader', () => {
  const Loader = () => <div data-testid="loader" />;
  return { __esModule: true, default: Loader };
});

const mockUseVaultShareQuoteWs = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/ws/useVaultShareQuoteWs', () => ({
  useVaultShareQuoteWs: mockUseVaultShareQuoteWs,
}));

vi.mock('~/lib/theme/chartColors', () => ({
  CHART_SERIES_COLORS: ['#4f6ef7'],
}));

import VaultSharePriceChart from '~/components/vaults/VaultSharePriceChart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60;
const nowSec = Math.floor(Date.now() / 1000);

const vaultStats = [
  {
    timestamp: nowSec - 2 * DAY,
    balance: '0',
    deployedCollateral: '0',
    undeployedCollateral: '0',
    cumulativePnl: '0',
    claimableCollateral: '0',
    sharePrice: '1.0100',
  },
  {
    timestamp: nowSec - DAY,
    balance: '0',
    deployedCollateral: '0',
    undeployedCollateral: '0',
    cumulativePnl: '0',
    claimableCollateral: '0',
    sharePrice: '1.0250',
  },
] as never[];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultSharePriceChart', () => {
  beforeEach(() => {
    mockUseVaultShareQuoteWs.mockReturnValue({
      vaultCollateralPerShare: '0',
      updatedAtMs: 0,
      source: 'fallback',
    });
  });

  it('renders the chart and the latest price headline from snapshots', () => {
    render(<VaultSharePriceChart vaultStats={vaultStats} isLoading={false} />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getByText('1.0250 USDe')).toBeInTheDocument();
  });

  it('prefers the live WS quote as the headline when available', () => {
    mockUseVaultShareQuoteWs.mockReturnValue({
      vaultCollateralPerShare: '1.0333',
      updatedAtMs: Date.now(),
      source: 'ws',
    });
    render(<VaultSharePriceChart vaultStats={vaultStats} isLoading={false} />);
    expect(screen.getByText('1.0333 USDe')).toBeInTheDocument();
  });

  it('shows the empty state when no snapshot carries a share price', () => {
    const nullStats = vaultStats.map((s: never) => ({
      ...(s as Record<string, unknown>),
      sharePrice: null,
    })) as never[];
    render(<VaultSharePriceChart vaultStats={nullStats} isLoading={false} />);
    expect(screen.getByText('No share price history yet')).toBeInTheDocument();
  });

  it('shows the loader while stats are loading', () => {
    render(<VaultSharePriceChart vaultStats={undefined} isLoading />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });
});
