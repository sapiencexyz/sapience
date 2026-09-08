import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

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
  test('defaults to the Robinhood Mainnet endpoint (the app default network)', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { getGraphQLEndpoint } = await import('./graphql');
    expect(getGraphQLEndpoint()).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });

  test('ignores NEXT_PUBLIC_FOIL_API_URL — the endpoint follows the network, not env', async () => {
    // The default endpoint must not be poisoned by a stray API env var; an
    // incognito session on the Robinhood default network stays on Meridian.
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.sapience.xyz';
    const { getGraphQLEndpoint } = await import('./graphql');
    expect(getGraphQLEndpoint()).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
  });

  test('prefers the Settings override in localStorage when running in the browser', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.sapience.xyz';
    const store: Record<string, string> = {
      'sapience.settings.graphqlEndpoint':
        'https://api.sapience.xyz/v2/graphql',
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: (key: string) => store[key] ?? null },
    });

    const { getGraphQLEndpoint } = await import('./graphql');
    expect(getGraphQLEndpoint()).toBe('https://api.sapience.xyz/v2/graphql');
  });

  test('migrates from the legacy graphqlEndpointV2 override key', async () => {
    const store: Record<string, string> = {
      'sapience.settings.graphqlEndpointV2':
        'https://api.staging.sapience.xyz/v2/graphql',
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: (key: string) => store[key] ?? null },
    });

    const { getGraphQLEndpoint } = await import('./graphql');
    expect(getGraphQLEndpoint()).toBe(
      'https://api.staging.sapience.xyz/v2/graphql'
    );
  });
});

describe('buildGraphQLGetUrl', () => {
  test('encodes the query as a GET param against the endpoint', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { buildGraphQLGetUrl } = await import('./graphql');

    const url = new URL(buildGraphQLGetUrl('{ ping }'));
    expect(url.origin + url.pathname).toBe(
      'https://api.predict.meridian.xyz/graphql'
    );
    expect(url.searchParams.get('query')).toBe('{ ping }');
    // no variables → no variables param
    expect(url.searchParams.has('variables')).toBe(false);
  });

  test('JSON-encodes non-empty variables', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { buildGraphQLGetUrl } = await import('./graphql');

    const url = new URL(
      buildGraphQLGetUrl('query Q($id: ID!) { node(id: $id) { id } }', {
        id: '0xabc',
      })
    );
    expect(url.searchParams.get('variables')).toBe(
      JSON.stringify({ id: '0xabc' })
    );
  });

  test('omits an empty variables object', async () => {
    delete process.env.NEXT_PUBLIC_FOIL_API_URL;
    const { buildGraphQLGetUrl } = await import('./graphql');

    const url = new URL(buildGraphQLGetUrl('{ ping }', {}));
    expect(url.searchParams.has('variables')).toBe(false);
  });
});
