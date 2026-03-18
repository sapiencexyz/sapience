/**
 * Tests for SessionContext
 *
 * Tests the React context provider, useSession hook, and utility functions.
 */

import { vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { Address, Hex } from 'viem';

// Mock addresses
const mockWalletAddress =
  '0x1234567890123456789012345678901234567890' as Address;
const mockSmartAccountAddress =
  '0xabcdef1234567890abcdef1234567890abcdef12' as Address;
const mockSessionKeyAddress =
  '0x9876543210987654321098765432109876543210' as Address;
const mockPrivateKey =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

// Mock wagmi hooks
const mockUseAccount = vi.fn();
const mockUseSwitchChain = vi.fn();

vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useSwitchChain: () => mockUseSwitchChain(),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
}));

// Mock viem
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: mockSessionKeyAddress,
    signMessage: vi.fn(() => Promise.resolve('0xsignature')),
    signTypedData: vi.fn(() => Promise.resolve('0xsignature')),
  })),
}));

// Mock session key manager
const mockCreateSession = vi.fn();
const mockRestoreSession = vi.fn();
const mockGetSmartAccountAddress = vi.fn();
const mockSaveSession = vi.fn();
const mockLoadSession = vi.fn();
const mockClearSession = vi.fn();

vi.mock('~/lib/session/sessionKeyManager', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  createArbitrumSession: vi.fn(),
  restoreSession: (...args: unknown[]) => mockRestoreSession(...args),
  getSmartAccountAddress: (...args: unknown[]) =>
    mockGetSmartAccountAddress(...args),
  saveSession: (...args: unknown[]) => mockSaveSession(...args),
  loadSession: () => mockLoadSession(),
  clearSession: () => mockClearSession(),
}));

// Import after mocks
import {
  SessionProvider,
  useSession,
  formatTimeRemaining,
} from './SessionContext';

// Test component that consumes the context
function TestConsumer() {
  const session = useSession();
  return (
    <div>
      <span data-testid="isSessionActive">
        {session.isSessionActive.toString()}
      </span>
      <span data-testid="isCalculatingAddress">
        {session.isCalculatingAddress.toString()}
      </span>
      <span data-testid="smartAccountAddress">
        {session.smartAccountAddress || 'null'}
      </span>
      <span data-testid="isStartingSession">
        {session.isStartingSession.toString()}
      </span>
      <span data-testid="timeRemainingMs">{session.timeRemainingMs}</span>
      <button
        onClick={() => session.startSession({ durationHours: 24 })}
        data-testid="startSession"
      >
        Start Session
      </button>
      <button onClick={() => session.endSession()} data-testid="endSession">
        End Session
      </button>
    </div>
  );
}

describe('SessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default mock implementations
    mockUseAccount.mockReturnValue({
      address: undefined,
      connector: undefined,
    });

    mockUseSwitchChain.mockReturnValue({
      switchChainAsync: vi.fn(),
    });

    mockLoadSession.mockReturnValue(null);
    mockGetSmartAccountAddress.mockReturnValue(mockSmartAccountAddress);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('SessionProvider', () => {
    it('renders children', () => {
      render(
        <SessionProvider>
          <div data-testid="child">Child content</div>
        </SessionProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('provides default inactive session state', () => {
      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      expect(screen.getByTestId('isSessionActive')).toHaveTextContent('false');
      expect(screen.getByTestId('isStartingSession')).toHaveTextContent(
        'false'
      );
      expect(screen.getByTestId('timeRemainingMs')).toHaveTextContent('0');
    });
  });

  describe('useSession hook', () => {
    it('throws error when used outside SessionProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Create a test component that catches the error
      const TestErrorBoundary = () => {
        try {
          useSession();
          return <div>No error</div>;
        } catch (error) {
          return (
            <div data-testid="error">
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          );
        }
      };

      render(<TestErrorBoundary />);
      expect(screen.getByTestId('error')).toHaveTextContent(
        'useSession must be used within a SessionProvider'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('smart account address calculation', () => {
    it('calculates address when wallet connects', async () => {
      vi.useRealTimers();
      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: { getProvider: vi.fn() },
      });

      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      // getSmartAccountAddress is now synchronous — address is set in useEffect
      await waitFor(() => {
        expect(mockGetSmartAccountAddress).toHaveBeenCalledWith(
          mockWalletAddress
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('smartAccountAddress')).toHaveTextContent(
          mockSmartAccountAddress
        );
      });
    });

    it('clears address when wallet disconnects', async () => {
      vi.useRealTimers();
      const { rerender } = render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      // Start with wallet connected
      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: { getProvider: vi.fn() },
      });

      rerender(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('smartAccountAddress')).toHaveTextContent(
          mockSmartAccountAddress
        );
      });

      // Disconnect wallet
      mockUseAccount.mockReturnValue({
        address: undefined,
        connector: undefined,
      });

      rerender(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('smartAccountAddress')).toHaveTextContent(
          'null'
        );
      });
    });
  });

  describe('startSession', () => {
    it('creates session and updates state', async () => {
      vi.useRealTimers();
      const mockProvider = { request: vi.fn() };
      const mockConnector = { getProvider: vi.fn(() => mockProvider) };

      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: mockConnector,
      });

      const mockSessionResult = {
        config: {
          durationHours: 24,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          ownerAddress: mockWalletAddress,
          smartAccountAddress: mockSmartAccountAddress,
        },
        etherealClient: {},
        arbitrumClient: null,
        serialized: {
          config: {
            durationHours: 24,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            ownerAddress: mockWalletAddress,
            smartAccountAddress: mockSmartAccountAddress,
          },
          sessionPrivateKey: mockPrivateKey,
          sessionKeyAddress: mockSessionKeyAddress,
          createdAt: Date.now(),
          etherealApproval: 'mock-ethereal-approval',
        },
      };

      mockCreateSession.mockResolvedValue(mockSessionResult);

      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      // Click start session button
      act(() => {
        screen.getByTestId('startSession').click();
      });

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isSessionActive')).toHaveTextContent('true');
      });

      expect(mockSaveSession).toHaveBeenCalledWith(
        mockSessionResult.serialized
      );
    });
  });

  describe('endSession', () => {
    it('clears session state and localStorage', async () => {
      vi.useRealTimers();
      const mockProvider = { request: vi.fn() };
      const mockConnector = { getProvider: vi.fn(() => mockProvider) };

      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: mockConnector,
      });

      const mockSessionResult = {
        config: {
          durationHours: 24,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          ownerAddress: mockWalletAddress,
          smartAccountAddress: mockSmartAccountAddress,
        },
        etherealClient: {},
        arbitrumClient: null,
        serialized: {
          config: {
            durationHours: 24,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            ownerAddress: mockWalletAddress,
            smartAccountAddress: mockSmartAccountAddress,
          },
          sessionPrivateKey: mockPrivateKey,
          sessionKeyAddress: mockSessionKeyAddress,
          createdAt: Date.now(),
          etherealApproval: 'mock-ethereal-approval',
        },
      };

      mockCreateSession.mockResolvedValue(mockSessionResult);

      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      // Start session first
      act(() => {
        screen.getByTestId('startSession').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isSessionActive')).toHaveTextContent('true');
      });

      // End session
      act(() => {
        screen.getByTestId('endSession').click();
      });

      expect(screen.getByTestId('isSessionActive')).toHaveTextContent('false');
      expect(mockClearSession).toHaveBeenCalled();
    });
  });

  describe('session restoration', () => {
    it('restores session from localStorage on mount', async () => {
      vi.useRealTimers();
      const mockProvider = { request: vi.fn() };
      const mockConnector = { getProvider: vi.fn(() => mockProvider) };

      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: mockConnector,
      });

      const storedSession = {
        config: {
          durationHours: 24,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          ownerAddress: mockWalletAddress,
          smartAccountAddress: mockSmartAccountAddress,
        },
        sessionPrivateKey: mockPrivateKey,
        sessionKeyAddress: mockSessionKeyAddress,
        createdAt: Date.now(),
        etherealApproval: 'mock-ethereal-approval',
      };

      mockLoadSession.mockReturnValue(storedSession);
      mockRestoreSession.mockResolvedValue({
        config: storedSession.config,
        etherealClient: {},
        arbitrumClient: null,
        serialized: storedSession,
      });

      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(mockRestoreSession).toHaveBeenCalledWith(storedSession);
      });

      await waitFor(() => {
        expect(screen.getByTestId('isSessionActive')).toHaveTextContent('true');
      });
    });

    it('clears expired session from localStorage', async () => {
      vi.useRealTimers(); // Use real timers for this test

      mockUseAccount.mockReturnValue({
        address: mockWalletAddress,
        connector: { getProvider: vi.fn() },
      });

      const expiredSession = {
        config: {
          durationHours: 24,
          expiresAt: Date.now() - 1000, // Expired
          ownerAddress: mockWalletAddress,
          smartAccountAddress: mockSmartAccountAddress,
        },
        sessionPrivateKey: mockPrivateKey,
        sessionKeyAddress: mockSessionKeyAddress,
        createdAt: Date.now() - 25 * 60 * 60 * 1000,
        etherealApproval: 'mock-ethereal-approval',
      };

      mockLoadSession.mockReturnValue(expiredSession);

      render(
        <SessionProvider>
          <TestConsumer />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(mockClearSession).toHaveBeenCalled();
      });

      // Session should not be restored
      expect(screen.getByTestId('isSessionActive')).toHaveTextContent('false');
    });
  });
});

describe('formatTimeRemaining', () => {
  it('returns "Expired" for zero or negative time', () => {
    expect(formatTimeRemaining(0)).toBe('Expired');
    expect(formatTimeRemaining(-1000)).toBe('Expired');
  });

  it('formats seconds only', () => {
    expect(formatTimeRemaining(30 * 1000)).toBe('30s');
    expect(formatTimeRemaining(59 * 1000)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeRemaining(90 * 1000)).toBe('1m 30s');
    expect(formatTimeRemaining(5 * 60 * 1000 + 15 * 1000)).toBe('5m 15s');
  });

  it('formats hours and minutes', () => {
    expect(formatTimeRemaining(60 * 60 * 1000)).toBe('1h 0m');
    expect(formatTimeRemaining(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe(
      '2h 30m'
    );
    expect(formatTimeRemaining(24 * 60 * 60 * 1000)).toBe('24h 0m');
  });
});
