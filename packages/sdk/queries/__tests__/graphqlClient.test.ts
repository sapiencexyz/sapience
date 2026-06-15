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
});

describe('getGraphQLEndpointV2', () => {
  test('targets /v2/graphql derived from the API base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const { getGraphQLEndpointV2 } = await import('../client/graphqlClient');
    expect(getGraphQLEndpointV2()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to the production v2 endpoint when base URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { getGraphQLEndpointV2 } = await import('../client/graphqlClient');
    expect(getGraphQLEndpointV2()).toBe('https://api.sapience.xyz/v2/graphql');
  });

  test('strips any path on the base URL, keeping only origin + /v2/graphql', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com/some/path';
    const { getGraphQLEndpointV2 } = await import('../client/graphqlClient');
    expect(getGraphQLEndpointV2()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to production v2 endpoint for an unparseable base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'not a url';
    const { getGraphQLEndpointV2 } = await import('../client/graphqlClient');
    expect(getGraphQLEndpointV2()).toBe('https://api.sapience.xyz/v2/graphql');
  });
});

describe('graphqlRequestV2', () => {
  test('issues the request against the v2 endpoint', async () => {
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

    const { graphqlRequestV2 } = await import('../client/graphqlClient');
    const result = await graphqlRequestV2<{ ok: boolean }>('query { ok }');

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

    const { graphqlRequestV2 } = await import('../client/graphqlClient');
    await graphqlRequestV2('query', { id: '7' });

    expect(requestMock).toHaveBeenCalledWith('query', { id: '7' });
  });

  test('rethrows when the underlying request fails', async () => {
    const boom = new Error('boom');
    vi.doMock('graphql-request', () => ({
      GraphQLClient: class {
        request = vi.fn().mockRejectedValue(boom);
      },
    }));

    const { graphqlRequestV2 } = await import('../client/graphqlClient');
    await expect(graphqlRequestV2('query')).rejects.toThrow('boom');
  });
});
