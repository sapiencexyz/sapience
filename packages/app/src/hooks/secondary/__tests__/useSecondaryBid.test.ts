import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Wagmi: EOA path uses signTypedDataAsync (must NOT be called when session is active)
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
  generateRandomNonce: () => 42n,
}));

vi.mock('@sapience/sdk/contracts', () => ({
  secondaryMarketEscrow: {
    5064014: { address: '0xSecondaryEscrow' },
  },
  collateralToken: {
    5064014: { address: '0xCollateral' },
  },
}));

vi.mock('@sapience/sdk/auction/secondarySigning', () => ({
  buildBuyerTradeApproval: vi.fn().mockReturnValue({
    domain: { name: 'SecondaryMarketEscrow', version: '1', chainId: 5064014n },
    types: { TradeApproval: [] },
    primaryType: 'TradeApproval',
    message: {},
  }),
}));

vi.mock('~/lib/context/SettingsContext', () => ({
  useSettings: () => ({ apiBaseUrl: 'https://api.test' }),
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

vi.mock('~/lib/ws/auctionUrl', () => ({
  toAuctionWsUrl: (base: string) => base.replace('http', 'ws') + '/ws',
}));

const wsSent: Array<unknown> = [];
const mockClient = {
  send: (msg: unknown) => {
    wsSent.push(msg);
  },
};
vi.mock('~/lib/ws/AuctionWsClient', () => ({
  getSharedAuctionWsClient: () => mockClient,
}));

const mockReadContract = vi.fn().mockResolvedValue(10n ** 36n);
vi.mock('~/lib/utils/util', () => ({
  getPublicClientForChainId: () => ({
    readContract: (...args: unknown[]) => mockReadContract(...args),
  }),
}));

vi.mock('~/hooks/blockchain/useSapienceWriteContract', () => ({
  useSapienceWriteContract: () => ({
    writeContract: vi.fn().mockResolvedValue(undefined),
    sendCalls: vi.fn(),
    isPending: false,
  }),
}));

import { useSecondaryBid } from '../useSecondaryBid';

const VALID_PARAMS = {
  auctionId: 'auction-1',
  token: '0xToken' as `0x${string}`,
  tokenAmount: 100n,
  price: 50n,
  seller: '0xSeller' as `0x${string}`,
};

describe('useSecondaryBid', () => {
  beforeEach(() => {
    wsSent.length = 0;
    mockSessionSignTypedData.mockClear();
    mockSignTypedDataAsync.mockClear();
    isUsingSession = true;
  });

  it('signs with kernel-wrapped signTypedData when session is active', async () => {
    const { result } = renderHook(() => useSecondaryBid());

    await act(async () => {
      await result.current.submitBid(VALID_PARAMS);
    });

    expect(mockSessionSignTypedData).toHaveBeenCalledTimes(1);
    expect(mockSignTypedDataAsync).not.toHaveBeenCalled();
  });

  it('omits buyerSessionKeyData from the WS payload (legacy on-chain path retired)', async () => {
    const { result } = renderHook(() => useSecondaryBid());

    await act(async () => {
      await result.current.submitBid(VALID_PARAMS);
    });

    expect(wsSent).toHaveLength(1);
    const msg = wsSent[0] as { type: string; payload: Record<string, unknown> };
    expect(msg.type).toBe('secondary.bid.submit');
    expect('buyerSessionKeyData' in msg.payload).toBe(false);
    expect(msg.payload.buyerSignature).toBe('0xKernelWrappedSig');
  });

  it('falls back to wagmi signTypedDataAsync for EOA users', async () => {
    isUsingSession = false;
    const { result } = renderHook(() => useSecondaryBid());

    await act(async () => {
      await result.current.submitBid(VALID_PARAMS);
    });

    expect(mockSignTypedDataAsync).toHaveBeenCalledTimes(1);
    expect(mockSessionSignTypedData).not.toHaveBeenCalled();
    const msg = wsSent[0] as { payload: { buyerSignature: string } };
    expect(msg.payload.buyerSignature).toBe('0xEoaSig');
  });
});
