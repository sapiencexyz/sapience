import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSignTypedDataAsync = vi.fn().mockResolvedValue('0xEoaSig');
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0xowner' }),
  useChainId: () => 5064014,
  useSignTypedData: () => ({ signTypedDataAsync: mockSignTypedDataAsync }),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    erc20Abi: [],
  };
});

vi.mock('@sapience/sdk', () => ({
  generateRandomNonce: () => 99n,
}));

vi.mock('@sapience/sdk/contracts', () => ({
  secondaryMarketEscrow: { 5064014: { address: '0xSecondaryEscrow' } },
  collateralToken: { 5064014: { address: '0xCollateral' } },
}));

vi.mock('@sapience/sdk/abis', () => ({
  secondaryMarketEscrowAbi: [
    {
      type: 'function',
      name: 'revokeSessionKey',
      inputs: [{ name: 'sessionKey', type: 'address' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ],
}));

vi.mock('@sapience/sdk/auction/secondarySigning', () => ({
  buildSellerTradeApproval: vi.fn().mockReturnValue({
    domain: { name: 'SecondaryMarketEscrow', version: '1', chainId: 5064014n },
    types: { TradeApproval: [] },
    primaryType: 'TradeApproval',
    message: {},
  }),
}));

const mockPrepareCalls = vi.fn();
vi.mock('@sapience/sdk/onchain/secondaryTrade', () => ({
  prepareExecuteTradeCalls: (...args: unknown[]) => {
    mockPrepareCalls(...args);
    return [{ to: '0xMarket', data: '0xCalldata' }];
  },
}));

const mockAddBreadcrumb = vi.fn();
const mockCaptureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockSessionSignTypedData = vi
  .fn()
  .mockResolvedValue('0xKernelWrappedSig');
let isUsingSession = true;
const mockSendUserOperation = vi.fn().mockResolvedValue('0xWarmupUserOpHash');
const mockWaitForUserOperationReceipt = vi.fn().mockResolvedValue({
  success: true,
  receipt: { transactionHash: '0xWarmupTxHash' },
});
let etherealClient: {
  sendUserOperation: typeof mockSendUserOperation;
  waitForUserOperationReceipt: typeof mockWaitForUserOperationReceipt;
} | null = {
  sendUserOperation: mockSendUserOperation,
  waitForUserOperationReceipt: mockWaitForUserOperationReceipt,
};
vi.mock('~/lib/context/SessionContext', () => ({
  useSession: () => ({
    effectiveAddress: '0xSmartAccount',
    isUsingSession,
    signTypedData: mockSessionSignTypedData,
    sessionKeyAddress: '0xSessionKey',
    chainClients: { ethereal: etherealClient, arbitrum: null },
  }),
}));

const mockIsSessionInstalledOnChain = vi.fn().mockReturnValue(false);
const mockMarkSessionInstalledOnChain = vi.fn();
vi.mock('~/lib/session/sessionKeyManager', () => ({
  isSessionInstalledOnChain: (...args: unknown[]) =>
    mockIsSessionInstalledOnChain(...args),
  markSessionInstalledOnChain: (...args: unknown[]) =>
    mockMarkSessionInstalledOnChain(...args),
}));

const mockReadContract = vi.fn().mockResolvedValue(0n);
vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: () => ({
    readContract: (...args: unknown[]) => mockReadContract(...args),
  }),
}));

vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: () => ({
    sendCalls: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

import { useSecondaryAccept } from '../useSecondaryAccept';

const baseBid = {
  auctionId: 'auction-x',
  buyer: '0xBuyer',
  price: '777',
  buyerNonce: 1,
  buyerDeadline: Math.floor(Date.now() / 1000) + 600,
  buyerSignature: '0xBuyerSig',
  receivedAt: new Date().toISOString(),
};

describe('useSecondaryAccept', () => {
  beforeEach(() => {
    mockPrepareCalls.mockClear();
    mockAddBreadcrumb.mockClear();
    mockCaptureException.mockClear();
    mockSessionSignTypedData.mockClear();
    mockSignTypedDataAsync.mockClear();
    mockSendUserOperation.mockClear();
    mockWaitForUserOperationReceipt.mockClear();
    mockIsSessionInstalledOnChain.mockReset().mockReturnValue(true);
    mockMarkSessionInstalledOnChain.mockClear();
    isUsingSession = true;
    etherealClient = {
      sendUserOperation: mockSendUserOperation,
      waitForUserOperationReceipt: mockWaitForUserOperationReceipt,
    };
  });

  it('builds trade params with sellerSessionKeyData=0x when session active', async () => {
    const { result } = renderHook(() => useSecondaryAccept());

    await act(async () => {
      await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: baseBid,
      });
    });

    expect(mockSessionSignTypedData).toHaveBeenCalledTimes(1);
    expect(mockPrepareCalls).toHaveBeenCalledTimes(1);
    const callArgs = mockPrepareCalls.mock.calls[0][0] as {
      trade: {
        sellerSessionKeyData: string;
        buyerSessionKeyData: string;
        sellerSignature: string;
      };
    };
    expect(callArgs.trade.sellerSessionKeyData).toBe('0x');
    expect(callArgs.trade.buyerSessionKeyData).toBe('0x');
    expect(callArgs.trade.sellerSignature).toBe('0xKernelWrappedSig');
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  it('emits a Sentry breadcrumb when the bid carries legacy buyerSessionKeyData', async () => {
    const { result } = renderHook(() => useSecondaryAccept());

    await act(async () => {
      await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: { ...baseBid, buyerSessionKeyData: '0xdeadbeef' },
      });
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0] as {
      category: string;
      message: string;
    };
    expect(arg.category).toBe('secondary.legacy_session_key');
    expect(arg.message).toBe('accept_received_legacy_buyer_session_key_data');
    const callArgs = mockPrepareCalls.mock.calls[0][0] as {
      trade: { buyerSessionKeyData: string };
    };
    expect(callArgs.trade.buyerSessionKeyData).toBe('0xdeadbeef');
  });

  // ── Session install warmup ─────────────────────────────────────────────

  it('skips warmup when session is already installed on this chain', async () => {
    mockIsSessionInstalledOnChain.mockReturnValue(true);
    const { result } = renderHook(() => useSecondaryAccept());

    await act(async () => {
      await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: baseBid,
      });
    });

    expect(mockSendUserOperation).not.toHaveBeenCalled();
    expect(mockMarkSessionInstalledOnChain).not.toHaveBeenCalled();
    // Trade still goes through.
    expect(mockSessionSignTypedData).toHaveBeenCalledTimes(1);
  });

  it('runs a no-op revokeSessionKey warmup when session is not installed', async () => {
    mockIsSessionInstalledOnChain.mockReturnValue(false);
    const { result } = renderHook(() => useSecondaryAccept());

    await act(async () => {
      await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: baseBid,
      });
    });

    expect(mockSendUserOperation).toHaveBeenCalledTimes(1);
    const sentCalls = (
      mockSendUserOperation.mock.calls[0][0] as {
        calls: Array<{ to: string; data: string; value: bigint }>;
      }
    ).calls;
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0].to).toBe('0xSecondaryEscrow');
    expect(sentCalls[0].value).toBe(0n);
    // First 4 bytes of revokeSessionKey(address) calldata, then padded zero
    // address as the only argument.
    expect(sentCalls[0].data.startsWith('0x')).toBe(true);

    expect(mockWaitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xWarmupUserOpHash',
    });
    expect(mockMarkSessionInstalledOnChain).toHaveBeenCalledWith(
      5064014,
      '0xSessionKey'
    );
    // Trade proceeds after the warmup.
    expect(mockSessionSignTypedData).toHaveBeenCalledTimes(1);
  });

  it('skips warmup in EOA mode (no session)', async () => {
    isUsingSession = false;
    mockIsSessionInstalledOnChain.mockReturnValue(false);
    const { result } = renderHook(() => useSecondaryAccept());

    await act(async () => {
      await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: baseBid,
      });
    });

    expect(mockSendUserOperation).not.toHaveBeenCalled();
    expect(mockMarkSessionInstalledOnChain).not.toHaveBeenCalled();
    expect(mockSignTypedDataAsync).toHaveBeenCalledTimes(1);
  });

  it('aborts the trade when the warmup userOp reverts', async () => {
    mockIsSessionInstalledOnChain.mockReturnValue(false);
    mockWaitForUserOperationReceipt.mockResolvedValueOnce({
      success: false,
      receipt: { transactionHash: '0xrevertedHash' },
    });

    const { result } = renderHook(() => useSecondaryAccept());

    let resp: { success: boolean; error?: string } = { success: false };
    await act(async () => {
      resp = await result.current.acceptBid({
        token: '0xToken',
        tokenAmount: 50n,
        bid: baseBid,
      });
    });

    expect(resp.success).toBe(false);
    expect(resp.error).toMatch(/Could not prepare session/);
    expect(mockSessionSignTypedData).not.toHaveBeenCalled();
    expect(mockMarkSessionInstalledOnChain).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
