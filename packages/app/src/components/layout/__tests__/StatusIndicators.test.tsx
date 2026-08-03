import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  CHAIN_ID_ROBINHOOD_MAINNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
} from '@sapience/sdk/constants';

import { StatusIndicators } from '../StatusIndicators';
import { useSettings } from '~/lib/context/SettingsContext';

vi.mock('~/lib/context/SettingsContext', () => ({
  useSettings: vi.fn(),
}));

vi.mock('~/hooks/blockchain/useRpcPing', () => ({
  useRpcPing: () => 42,
}));

vi.mock('~/hooks/ws/usePeerMesh', () => ({
  usePeerMesh: () => ({
    peerCount: 0,
    bandwidthKbps: 0,
    signalConnected: true,
    knownPeerCount: 0,
  }),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: React.ComponentProps<'img'>) => <img {...props} />,
}));

vi.mock('@sapience/ui/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

function mockSettings(overrides: Record<string, unknown> = {}) {
  (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    signalEndpoint: '',
    customChainId: null,
    customRpcURL: null,
    ...overrides,
  });
}

describe('StatusIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('hides the peer indicator when the signal endpoint is blank', () => {
    mockSettings({ signalEndpoint: '' });
    render(<StatusIndicators />);
    expect(screen.queryByText(/PEERS?/)).toBeNull();
    expect(screen.queryByText(/MESH PENDING/)).toBeNull();
  });

  test('shows the Robinhood logomark when the custom chain is Robinhood mainnet', () => {
    mockSettings({ customChainId: CHAIN_ID_ROBINHOOD_MAINNET });
    render(<StatusIndicators />);
    expect(screen.getByAltText('Robinhood')).toBeInTheDocument();
    expect(screen.queryByAltText('Ethereal')).toBeNull();
  });

  test('shows the Robinhood logomark when the custom chain is Robinhood testnet', () => {
    mockSettings({ customChainId: CHAIN_ID_ROBINHOOD_TESTNET });
    render(<StatusIndicators />);
    expect(screen.getByAltText('Robinhood')).toBeInTheDocument();
  });

  test('shows the Ethereal logomark for a non-Robinhood chain', () => {
    // No custom chain: falls back to the build default (Ethereal in tests).
    mockSettings({ customChainId: null });
    render(<StatusIndicators />);
    expect(screen.getByAltText('Ethereal')).toBeInTheDocument();
    expect(screen.queryByAltText('Robinhood')).toBeNull();
  });
});
