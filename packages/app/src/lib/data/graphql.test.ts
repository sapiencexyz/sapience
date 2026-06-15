import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getGraphQLEndpoint (v1) stays on /graphql', () => {
  test('derives /graphql from the API base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const { getGraphQLEndpoint } = await import('./graphql');
    expect(getGraphQLEndpoint()).toBe('https://api.example.com/graphql');
  });
});

describe('getGraphQLEndpointV2', () => {
  test('derives /v2/graphql from the API base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com';
    const { getGraphQLEndpointV2 } = await import('./graphql');
    expect(getGraphQLEndpointV2()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to the production v2 endpoint when base URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { getGraphQLEndpointV2 } = await import('./graphql');
    expect(getGraphQLEndpointV2()).toBe('https://api.sapience.xyz/v2/graphql');
  });

  test('keeps only origin + /v2/graphql, dropping any base path', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.example.com/nested';
    const { getGraphQLEndpointV2 } = await import('./graphql');
    expect(getGraphQLEndpointV2()).toBe('https://api.example.com/v2/graphql');
  });

  test('falls back to production v2 endpoint for an unparseable base URL', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'not a url';
    const { getGraphQLEndpointV2 } = await import('./graphql');
    expect(getGraphQLEndpointV2()).toBe('https://api.sapience.xyz/v2/graphql');
  });
});
