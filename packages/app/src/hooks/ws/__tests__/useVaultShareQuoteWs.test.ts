import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVaultShareQuoteWs } from '../useVaultShareQuoteWs';

// ---- mocks ----

let messageListeners: Array<(msg: unknown) => void> = [];
let openListeners: Array<() => void> = [];
const mockSend = vi.fn();

vi.mock('~/lib/ws/AuctionWsClient', () => ({
  getSharedAuctionWsClient: () => ({
    send: mockSend,
    addMessageListener: (fn: (msg: unknown) => void) => {
      messageListeners.push(fn);
      return () => {
        messageListeners = messageListeners.filter((l) => l !== fn);
      };
    },
    addOpenListener: (fn: () => void) => {
      openListeners.push(fn);
      return () => {
        openListeners = openListeners.filter((l) => l !== fn);
      };
    },
  }),
}));

vi.mock('~/lib/ws', () => ({
  toAuctionWsUrl: (base: string) => `wss://mock/${base}`,
}));

vi.mock('~/lib/context/SettingsContext', () => ({
  useSettings: () => ({ apiBaseUrl: 'https://api.test' }),
}));

// ---- helpers ----

const CHAIN_ID = 1;
const VAULT = '0xabc' as `0x${string}`;

function emitQuote(timestamp: number, value = '1.05') {
  const msg = {
    type: 'vault_quote.update',
    payload: {
      chainId: CHAIN_ID,
      vaultAddress: VAULT,
      vaultCollateralPerShare: value,
      timestamp,
    },
  };
  messageListeners.forEach((fn) => fn(msg));
}

// ---- tests ----

beforeEach(() => {
  messageListeners = [];
  openListeners = [];
  mockSend.mockClear();
});

describe('useVaultShareQuoteWs – monotonic freshness guard', () => {
  it('accepts a newer quote', () => {
    const { result } = renderHook(() =>
      useVaultShareQuoteWs({ chainId: CHAIN_ID, vaultAddress: VAULT })
    );

    act(() => emitQuote(1000, '1.00'));
    expect(result.current.updatedAtMs).toBe(1000);
    expect(result.current.vaultCollateralPerShare).toBe('1.00');
    expect(result.current.source).toBe('ws');

    act(() => emitQuote(2000, '1.10'));
    expect(result.current.updatedAtMs).toBe(2000);
    expect(result.current.vaultCollateralPerShare).toBe('1.10');
  });

  it('rejects a stale replay (older timestamp)', () => {
    const { result } = renderHook(() =>
      useVaultShareQuoteWs({ chainId: CHAIN_ID, vaultAddress: VAULT })
    );

    act(() => emitQuote(2000, '1.10'));
    expect(result.current.updatedAtMs).toBe(2000);

    // Replay an older quote
    act(() => emitQuote(1000, '0.90'));
    expect(result.current.updatedAtMs).toBe(2000);
    expect(result.current.vaultCollateralPerShare).toBe('1.10');
  });

  it('rejects a quote with equal timestamp', () => {
    const { result } = renderHook(() =>
      useVaultShareQuoteWs({ chainId: CHAIN_ID, vaultAddress: VAULT })
    );

    act(() => emitQuote(1500, '1.05'));
    expect(result.current.updatedAtMs).toBe(1500);

    // Same timestamp, different value — should be rejected
    act(() => emitQuote(1500, '9.99'));
    expect(result.current.updatedAtMs).toBe(1500);
    expect(result.current.vaultCollateralPerShare).toBe('1.05');
  });
});
