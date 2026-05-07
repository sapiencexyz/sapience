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

const mockSessionSignTypedData = vi
  .fn()
  .mockResolvedValue('0xKernelWrappedSig');
let isUsingSession = true;
vi.mock('~/lib/context/SessionContext', () => ({
  useSession: () => ({
    effectiveAddress: '0xSmartAccount',
    isUsingSession,
    signTypedData: mockSessionSignTypedData,
  }),
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
    mockSessionSignTypedData.mockClear();
    mockSignTypedDataAsync.mockClear();
    isUsingSession = true;
  });

  it('builds trade params and signs with session when session active', async () => {
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
      trade: { sellerSignature: string };
    };
    expect(callArgs.trade.sellerSignature).toBe('0xKernelWrappedSig');
  });
});
