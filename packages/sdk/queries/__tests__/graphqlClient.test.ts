import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// We re-import the module fresh per test so that the env-var-derived endpoint
// is recomputed (the builders read process.env at call time, but importing
// fresh keeps each case isolated and mirrors how callers use it).

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('getGraphQLEndpoint', () => {
  test('targets /v2/graphql derived from the API base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to the production endpoint when base URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe('https://api.sapience.xyz/v2/graphql');
  });

  test('strips any path on the base URL, keeping only origin + /v2/graphql', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com/some/path';
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to the production endpoint for an unparseable base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'not a url';
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe('https://api.sapience.xyz/v2/graphql');
  });

  test('prefers the stored override over the env default', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const store: Record<string, string> = {
      'sapience.settings.graphqlEndpoint':
        'https://api.predict.meridian.xyz/graphql',
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store[k] ?? null },
    });
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });

  test('migrates: falls back to the legacy v2 key when the new key is absent', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const store: Record<string, string> = {
      'sapience.settings.graphqlEndpointV2':
        'https://api.predict.meridian.xyz/graphql',
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store[k] ?? null },
    });
    const { getGraphQLEndpoint } = await import('../client/graphqlClient');
    expect(getGraphQLEndpoint()).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });
});

describe('graphqlRequest', () => {
  test('issues the request against the resolved endpoint', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';

    const requestMock = vi.fn().mockResolvedValue({ ok: true });
    const constructed: string[] = [];
    vi.doMock('graphql-request', () => ({
      GraphQLClient: class {
        constructor(endpoint: string) {
          constructed.push(endpoint);
        }

        request = requestMock;
      },
    }));

    const { graphqlRequest } = await import('../client/graphqlClient');
    const result = await graphqlRequest<{ ok: boolean }>('query { ok }');

    expect(constructed).toContain('https://api.example.com/v2/graphql');
    expect(requestMock).toHaveBeenCalledWith('query { ok }', undefined);
    expect(result).toEqual({ ok: true });
  });

  test('passes variables through to the underlying client', async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: 1 });
    vi.doMock('graphql-request', () => ({
      GraphQLClient: class {
        request = requestMock;
      },
    }));

    const { graphqlRequest } = await import('../client/graphqlClient');
    await graphqlRequest('query', { id: '7' });

    expect(requestMock).toHaveBeenCalledWith('query', { id: '7' });
  });

  test('rethrows when the underlying request fails', async () => {
    const boom = new Error('boom');
    vi.doMock('graphql-request', () => ({
      GraphQLClient: class {
        request = vi.fn().mockRejectedValue(boom);
      },
    }));

    const { graphqlRequest } = await import('../client/graphqlClient');
    await expect(graphqlRequest('query')).rejects.toThrow('boom');
  });
});
