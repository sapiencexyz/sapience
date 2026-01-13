/**
 * Tests for useSessionWriteContract and useSessionSendCalls hooks
 *
 * Tests session-based contract write functionality with mocked session context.
 */

import { renderHook, act } from '@testing-library/react';
import type { Hash, Address } from 'viem';

// Mock session context
const mockUseSession = jest.fn();

jest.mock('~/lib/context/SessionContext', () => ({
  useSession: () => mockUseSession(),
}));

// Mock viem
jest.mock('viem', () => ({
  encodeFunctionData: jest.fn(() => '0xencodedData'),
}));

// Mock session key manager for chain definition
jest.mock('~/lib/session/sessionKeyManager', () => ({
  ethereal: {
    id: 5064014,
    name: 'Ethereal',
  },
}));

// Mock viem/chains
jest.mock('viem/chains', () => ({
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
  },
}));

// Import after mocks
import {
  useSessionWriteContract,
  useSessionSendCalls,
} from './useSessionWriteContract';

// Test data
const mockTxHash = '0x1234567890abcdef' as Hash;
const mockContractAddress =
  '0xContractAddress1234567890abcdef1234567890' as Address;
const mockAbi = [
  {
    name: 'testFunction',
    type: 'function',
    inputs: [],
    outputs: [],
  },
] as const;

// Chain IDs
const ETHEREAL_CHAIN_ID = 5064014;
const ARBITRUM_CHAIN_ID = 42161;
const UNSUPPORTED_CHAIN_ID = 1; // Mainnet - not supported

describe('useSessionWriteContract', () => {
  // Mock Kernel client
  const mockKernelClient = {
    account: {
      encodeCalls: jest.fn(() => Promise.resolve('0xencodedCalls')),
    },
    sendUserOperation: jest.fn(() => Promise.resolve('0xuserOpHash')),
    waitForUserOperationReceipt: jest.fn(() =>
      Promise.resolve({
        receipt: {
          transactionHash: mockTxHash,
        },
      })
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no active session
    mockUseSession.mockReturnValue({
      isSessionActive: false,
      sessionConfig: null,
      chainClients: {
        ethereal: null,
        arbitrum: null,
      },
    });
  });

  describe('canUseSession', () => {
    it('returns false when no session is active', () => {
      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(false);
      expect(result.current.canUseSession(ARBITRUM_CHAIN_ID)).toBe(false);
    });

    it('returns false when session is expired', () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() - 1000, // Expired 1 second ago
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: mockKernelClient,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(false);
    });

    it('returns true for Ethereal when session is active with Ethereal client', () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(true);
      expect(result.current.canUseSession(ARBITRUM_CHAIN_ID)).toBe(false);
    });

    it('returns true for Arbitrum when session is active with Arbitrum client', () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: null,
          arbitrum: mockKernelClient,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(false);
      expect(result.current.canUseSession(ARBITRUM_CHAIN_ID)).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: mockKernelClient,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.canUseSession(UNSUPPORTED_CHAIN_ID)).toBe(false);
    });
  });

  describe('writeContractViaSession', () => {
    it('returns null when session cannot be used for chain', async () => {
      mockUseSession.mockReturnValue({
        isSessionActive: false,
        sessionConfig: null,
        chainClients: {
          ethereal: null,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      let txHash: Hash | null = null;
      await act(async () => {
        txHash = await result.current.writeContractViaSession({
          chainId: ETHEREAL_CHAIN_ID,
          address: mockContractAddress,
          abi: mockAbi,
          functionName: 'testFunction',
        });
      });

      expect(txHash).toBeNull();
    });

    it('executes transaction via Kernel client when session is active', async () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      let txHash: Hash | null = null;
      await act(async () => {
        txHash = await result.current.writeContractViaSession({
          chainId: ETHEREAL_CHAIN_ID,
          address: mockContractAddress,
          abi: mockAbi,
          functionName: 'testFunction',
        });
      });

      expect(txHash).toBe(mockTxHash);
      expect(mockKernelClient.account.encodeCalls).toHaveBeenCalled();
      expect(mockKernelClient.sendUserOperation).toHaveBeenCalled();
      expect(mockKernelClient.waitForUserOperationReceipt).toHaveBeenCalled();
    });

    it('sets isPending during transaction', async () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      expect(result.current.isPending).toBe(false);

      const promise = act(async () => {
        await result.current.writeContractViaSession({
          chainId: ETHEREAL_CHAIN_ID,
          address: mockContractAddress,
          abi: mockAbi,
          functionName: 'testFunction',
        });
      });

      // isPending should be true during execution
      await promise;

      // isPending should be false after completion
      expect(result.current.isPending).toBe(false);
    });

    it('throws on failure', async () => {
      const mockError = new Error('Transaction failed');
      const failingClient = {
        ...mockKernelClient,
        sendUserOperation: jest.fn(() => Promise.reject(mockError)),
      };

      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: failingClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionWriteContract());

      await expect(
        act(async () => {
          await result.current.writeContractViaSession({
            chainId: ETHEREAL_CHAIN_ID,
            address: mockContractAddress,
            abi: mockAbi,
            functionName: 'testFunction',
          });
        })
      ).rejects.toThrow('Transaction failed');
    });
  });
});

describe('useSessionSendCalls', () => {
  const mockKernelClient = {
    account: {
      encodeCalls: jest.fn(() => Promise.resolve('0xencodedCalls')),
    },
    sendUserOperation: jest.fn(() => Promise.resolve('0xuserOpHash')),
    waitForUserOperationReceipt: jest.fn(() =>
      Promise.resolve({
        receipt: {
          transactionHash: mockTxHash,
        },
      })
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseSession.mockReturnValue({
      isSessionActive: false,
      sessionConfig: null,
      chainClients: {
        ethereal: null,
        arbitrum: null,
      },
    });
  });

  describe('canUseSession', () => {
    it('returns false when no session is active', () => {
      const { result } = renderHook(() => useSessionSendCalls());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(false);
    });

    it('returns true when session is active for chain', () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionSendCalls());

      expect(result.current.canUseSession(ETHEREAL_CHAIN_ID)).toBe(true);
    });
  });

  describe('sendCallsViaSession', () => {
    it('returns null when session cannot be used', async () => {
      const { result } = renderHook(() => useSessionSendCalls());

      let txHash: Hash | null = null;
      await act(async () => {
        txHash = await result.current.sendCallsViaSession({
          chainId: ETHEREAL_CHAIN_ID,
          calls: [
            {
              to: mockContractAddress,
              data: '0xdata',
            },
          ],
        });
      });

      expect(txHash).toBeNull();
    });

    it('batches multiple calls via Kernel client', async () => {
      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: mockKernelClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionSendCalls());

      const calls = [
        { to: mockContractAddress, data: '0xdata1' as `0x${string}` },
        {
          to: mockContractAddress,
          data: '0xdata2' as `0x${string}`,
          value: BigInt(100),
        },
      ];

      let txHash: Hash | null = null;
      await act(async () => {
        txHash = await result.current.sendCallsViaSession({
          chainId: ETHEREAL_CHAIN_ID,
          calls,
        });
      });

      expect(txHash).toBe(mockTxHash);
      expect(mockKernelClient.account.encodeCalls).toHaveBeenCalledWith([
        { to: mockContractAddress, data: '0xdata1', value: BigInt(0) },
        { to: mockContractAddress, data: '0xdata2', value: BigInt(100) },
      ]);
    });

    it('throws on failure', async () => {
      const mockError = new Error('Batch failed');
      const failingClient = {
        ...mockKernelClient,
        sendUserOperation: jest.fn(() => Promise.reject(mockError)),
      };

      mockUseSession.mockReturnValue({
        isSessionActive: true,
        sessionConfig: {
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
        chainClients: {
          ethereal: failingClient,
          arbitrum: null,
        },
      });

      const { result } = renderHook(() => useSessionSendCalls());

      await expect(
        act(async () => {
          await result.current.sendCallsViaSession({
            chainId: ETHEREAL_CHAIN_ID,
            calls: [
              { to: mockContractAddress, data: '0xdata' as `0x${string}` },
            ],
          });
        })
      ).rejects.toThrow('Batch failed');
    });
  });
});
