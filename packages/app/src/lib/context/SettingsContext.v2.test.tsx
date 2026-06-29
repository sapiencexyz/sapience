/**
 * Tests for the v2 GraphQL endpoint wiring in SettingsContext.
 *
 * Covers the default `/v2/graphql` resolution, localStorage override
 * hydration, and the setter persisting under its own key without disturbing v1.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeAll, describe, test, expect, beforeEach } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsContext';

const V2_KEY = 'sapience.settings.graphqlEndpointV2';
const V1_KEY = 'sapience.settings.graphqlEndpoint';
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
  const { graphqlEndpoint, graphqlEndpointV2, setGraphqlEndpointV2, defaults } =
    useSettings();
  return (
    <div>
      <span data-testid="v1">{graphqlEndpoint ?? ''}</span>
      <span data-testid="v2">{graphqlEndpointV2 ?? ''}</span>
      <span data-testid="default-v2">{defaults.graphqlEndpointV2}</span>
      <button
        type="button"
        data-testid="set"
        onClick={() =>
          setGraphqlEndpointV2('https://staging.example.com/v2/graphql')
        }
      >
        set
      </button>
      <button
        type="button"
        data-testid="clear"
        onClick={() => setGraphqlEndpointV2(null)}
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
});

describe('SettingsContext v2 GraphQL endpoint', () => {
  test('defaults v2 endpoint to the /v2/graphql path of the API origin', async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('v2').textContent).toMatch(/\/v2\/graphql$/);
    });

    // v1 must remain on the bare /graphql path, not /v2/graphql.
    const v1 = screen.getByTestId('v1').textContent ?? '';
    expect(v1.endsWith('/graphql')).toBe(true);
    expect(v1.endsWith('/v2/graphql')).toBe(false);

    expect(screen.getByTestId('default-v2').textContent).toMatch(
      /\/v2\/graphql$/
    );
  });

  test('hydrates the v2 endpoint from its dedicated localStorage key', async () => {
    window.localStorage.setItem(
      V2_KEY,
      'https://override.example.com/v2/graphql'
    );

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('v2').textContent).toBe(
        'https://override.example.com/v2/graphql'
      );
    });
  });

  test('setter persists under the v2 key and leaves the v1 key untouched', async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('v2').textContent).not.toBe('');
    });

    act(() => {
      screen.getByTestId('set').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('v2').textContent).toBe(
        'https://staging.example.com/v2/graphql'
      );
    });
    expect(window.localStorage.getItem(V2_KEY)).toBe(
      'https://staging.example.com/v2/graphql'
    );
    // Writing v2 must not write the v1 override key.
    expect(window.localStorage.getItem(V1_KEY)).toBeNull();
  });

  test('clearing the v2 override removes the key and falls back to the default', async () => {
    window.localStorage.setItem(
      V2_KEY,
      'https://override.example.com/v2/graphql'
    );

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('v2').textContent).toBe(
        'https://override.example.com/v2/graphql'
      );
    });

    act(() => {
      screen.getByTestId('clear').click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(V2_KEY)).toBeNull();
    });
    expect(screen.getByTestId('v2').textContent).toMatch(/\/v2\/graphql$/);
  });
});

describe('SettingsContext chat endpoint disable', () => {
  test('defaults to a non-empty chat endpoint so the bubble shows', async () => {
    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).not.toBe('');
    });
    expect(screen.getByTestId('chat').textContent).not.toBe('<empty>');
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

  test('setChatBaseUrl(null) removes the override and re-enables the default', async () => {
    window.localStorage.setItem(CHAT_KEY, '');

    render(
      <SettingsProvider>
        <ChatProbe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chat').textContent).toBe('<empty>');
    });

    act(() => {
      screen.getByTestId('chat-reset').click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(CHAT_KEY)).toBeNull();
    });
    expect(screen.getByTestId('chat').textContent).not.toBe('<empty>');
  });
});
