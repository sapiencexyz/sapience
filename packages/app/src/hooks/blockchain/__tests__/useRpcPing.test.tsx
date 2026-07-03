import { renderHook, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRpcUrl, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import { useRpcPing } from '../useRpcPing';
import { useSettings } from '~/lib/context/SettingsContext';

vi.mock('~/lib/context/SettingsContext', () => ({
  useSettings: vi.fn(),
}));

vi.mock('~/hooks/useAnimatedNumber', () => ({
  useAnimatedNumber: (value: number | null) => value,
}));

const fetchMock = vi.fn().mockResolvedValue({});

function mockSettings(customRpcURL: string | null) {
  (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    customRpcURL,
    customChainId: customRpcURL ? 4663 : null,
  });
}

describe('useRpcPing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('pings the custom RPC URL when one is entered', async () => {
    mockSettings('https://my-node.example.com');
    renderHook(() => useRpcPing());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('https://my-node.example.com');
  });

  test('falls back to the default chain RPC when no custom RPC is set', async () => {
    mockSettings(null);
    renderHook(() => useRpcPing());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe(getRpcUrl(DEFAULT_CHAIN_ID));
  });
});
