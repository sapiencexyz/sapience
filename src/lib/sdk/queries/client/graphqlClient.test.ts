import { vi, describe, it, expect, afterEach } from 'vitest';
import { graphqlRequest } from './graphqlClient';

// Header names a browser may attach to a cross-origin request without
// triggering a CORS preflight (the "simple request" safelist). The GraphQL
// client must stay within this set: the API is on a different origin than
// the app, and any custom header turns every GET query into an
// OPTIONS + GET pair — the preflight cache is keyed by exact URL, so
// GraphQL-over-GET (query in the query string) never reuses it.
const CORS_SAFELISTED_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-language',
  'content-type',
]);

describe('graphqlRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only CORS-safelisted headers so GET queries skip preflight', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { __typename: 'Query' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await graphqlRequest<{ __typename: string }>('query { __typename }');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const sentHeaders = [...new Headers(init.headers).keys()];
    const unsafeHeaders = sentHeaders.filter(
      (name) => !CORS_SAFELISTED_HEADERS.has(name)
    );
    expect(unsafeHeaders).toEqual([]);
  });

  it('issues queries as GET requests', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { __typename: 'Query' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await graphqlRequest<{ __typename: string }>('query { __typename }');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
  });
});
