import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: (props: { scale?: string }) => (
    <div data-testid="y-axis" data-scale={String(props.scale)} />
  ),
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 42161,
  COLLATERAL_SYMBOLS: { 42161: 'USDe' },
}));

vi.mock('@sapience/ui/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock('@sapience/ui/components/ui/button', () => ({
  Button: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      children: React.ReactNode;
    }
  ) => (
    <button
      onClick={props.onClick}
      aria-label={props['aria-label']}
      aria-pressed={props['aria-pressed']}
      className={props.className}
    >
      {props.children}
    </button>
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

vi.mock('~/hooks/graphql/useAnalytics', () => ({
  useProtocolStats: () => ({ data: undefined, isLoading: false }),
}));

import VaultPnlChart from '~/components/vaults/VaultPnlChart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60;
const nowSec = Math.floor(Date.now() / 1000);

const protocolStats = [
  {
    timestamp: nowSec - 2 * DAY,
    vaultCumulativePnL: '0',
    vaultBalance: (1000n * 10n ** 18n).toString(),
    escrowBalance: '0',
  },
  {
    timestamp: nowSec - DAY,
    vaultCumulativePnL: (50n * 10n ** 18n).toString(),
    vaultBalance: (1050n * 10n ** 18n).toString(),
    escrowBalance: '0',
  },
  {
    timestamp: nowSec,
    vaultCumulativePnL: (120n * 10n ** 18n).toString(),
    vaultBalance: (1120n * 10n ** 18n).toString(),
    escrowBalance: '0',
  },
] as never[];

function renderChart() {
  return render(
    <VaultPnlChart protocolStats={protocolStats} isLoading={false} />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultPnlChart log scale toggle', () => {
  it('renders a log scale toggle button, off by default', () => {
    renderChart();
    const toggle = screen.getByRole('button', {
      name: /toggle logarithmic scale/i,
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('y-axis')).toHaveAttribute(
      'data-scale',
      'linear'
    );
  });

  it('switches the Y axis to a symlog scale when toggled on', () => {
    renderChart();
    const toggle = screen.getByRole('button', {
      name: /toggle logarithmic scale/i,
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('y-axis')).toHaveAttribute(
      'data-scale',
      'symlog'
    );
  });

  it('returns to a linear scale when toggled off again', () => {
    renderChart();
    const toggle = screen.getByRole('button', {
      name: /toggle logarithmic scale/i,
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('y-axis')).toHaveAttribute(
      'data-scale',
      'linear'
    );
  });
});
