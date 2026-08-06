/**
 * Tests for the single GraphQL endpoint wiring in SettingsContext.
 *
 * Covers the default `/v2/graphql` resolution, localStorage override hydration,
 * migration from the legacy `graphqlEndpointV2` key, and the setter persisting
 * under the single key while clearing the legacy one.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeAll, describe, test, expect, beforeEach } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsContext';

const KEY = 'sapience.settings.graphqlEndpoint';
const LEGACY_KEY = 'sapience.settings.graphqlEndpointV2';
const CHAT_KEY = 'sapience.settings.chatBaseUrl';

// jsdom in this environment does not ship a working localStorage (it requires
// node's --localstorage-file flag), so install a minimal in-memory shim. The
// SettingsContext only needs getItem/setItem/removeItem/clear.
beforeAll(() => {
  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage?.clear !== 'function'
  ) {
    const store = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: shim,
    });
  }
});

function Probe() {
  const { graphqlEndpoint, setGraphqlEndpoint, defaults } = useSettings();
  return (
    <div>
      <span data-testid="endpoint">{graphqlEndpoint ?? ''}</span>
      <span data-testid="default">{defaults.graphqlEndpoint}</span>
      <button
        type="button"
        data-testid="set"
        onClick={() =>
          setGraphqlEndpoint('https://staging.example.com/v2/graphql')
        }
      >
        set
      </button>
      <button
        type="button"
        data-testid="clear"
        onClick={() => setGraphqlEndpoint(null)}
      >
        clear
      </button>
    </div>
  );
}

function ChatProbe() {
  const { chatBaseUrl, setChatBaseUrl, defaults } = useSettings();
  return (
    <div>
      {/* Distinguish '' (disabled) from null (pre-mount) in the DOM. */}
      <span data-testid="chat">
        {chatBaseUrl === '' ? '<empty>' : chatBaseUrl}
      </span>
      <span data-testid="default-chat">{defaults.chatBaseUrl}</span>
      <button
        type="button"
        data-testid="chat-disable"
        onClick={() => setChatBaseUrl('')}
      >
        disable
      </button>
      <button
        type="button"
        data-testid="chat-reset"
        onClick={() => setChatBaseUrl(null)}
      >
        reset
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // Pre-seed the one-time Robinhood-defaults migration flag so seeded
  // overrides hydrate instead of being cleared on mount (the post-migration
  // state every returning user is in).
  window.localStorage.setItem(
    'sapience.settings.robinhoodDefaultsMigrated',
    '1'
  );
});

describe('SettingsContext GraphQL endpoint', () => {
  test('defaults the endpoint to Robinhood Mainnet (Meridian /graphql)', async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(
        'https://api.predict.meridian.xyz/graphql'
      );
    });
    expect(screen.getByTestId('default').textContent).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });

  test('hydrates the endpoint from its localStorage key', async () => {
    window.localStorage.setItem(KEY, 'https://override.example.com/v2/graphql');

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(
        'https://override.example.com/v2/graphql'
      );
    });
  });

  test('migrates from the legacy v2 key when the new key is absent', async () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      'https://api.predict.meridian.xyz/graphql'
    );

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(
        'https://api.predict.meridian.xyz/graphql'
      );
    });
  });

  test('setter persists under the key and clears the legacy key', async () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      'https://api.predict.meridian.xyz/graphql'
    );

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).not.toBe('');
    });

    act(() => {
      screen.getByTestId('set').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(
        'https://staging.example.com/v2/graphql'
      );
    });
    expect(window.localStorage.getItem(KEY)).toBe(
      'https://staging.example.com/v2/graphql'
    );
    // The legacy key must be removed so a stale value can't resurface.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  test('clearing the override removes the key and falls back to the default', async () => {
    window.localStorage.setItem(KEY, 'https://override.example.com/v2/graphql');

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(
        'https://override.example.com/v2/graphql'
      );
    });

    act(() => {
      screen.getByTestId('clear').click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });
    expect(screen.getByTestId('endpoint').textContent).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });
});

describe('SettingsContext chat endpoint disable', () => {
  test('defaults to a blank chat endpoint (Robinhood Mainnet ships chat off)', async () => {
    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    // Robinhood Mainnet is the default network and ships without chat, so the
    // default chat base is blank and the bubble stays hidden.
    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).toBe('<empty>');
    });
    expect(screen.getByTestId('default-chat').textContent).toBe('');
  });

  test('hydrates an explicit blank override as disabled (empty string)', async () => {
    window.localStorage.setItem(CHAT_KEY, '');

    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).toBe('<empty>');
    });
  });

  test('setChatBaseUrl("") persists a blank value and disables chat', async () => {
    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).not.toBe('');
    });

    act(() => {
      screen.getByTestId('chat-disable').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).toBe('<empty>');
    });
    // Blank must be persisted (empty string), not removed, so it wins over the
    // default on the next load.
    expect(window.localStorage.getItem(CHAT_KEY)).toBe('');
  });

  test('setChatBaseUrl(null) removes the override and falls back to the default', async () => {
    // Seed a non-blank override so the reset has something to clear (an explicit
    // blank and the default are both blank now that Robinhood is the default).
    window.localStorage.setItem(CHAT_KEY, 'https://chat.example.com/chat');

    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      const text = screen.getByTestId('chat').textContent;
      expect(text).not.toBe('');
      expect(text).not.toBe('<empty>');
    });

    act(() => {
      screen.getByTestId('chat-reset').click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(CHAT_KEY)).toBeNull();
    });
    // Reset falls back to the default, which for Robinhood Mainnet is blank.
    expect(screen.getByTestId('chat').textContent).toBe('<empty>');
  });
});
