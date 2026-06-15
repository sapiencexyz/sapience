/**
 * Sapience Edge Cache Worker
 *
 * Sits in front of api.sapience.xyz and caches GraphQL POST responses
 * at Cloudflare edge PoPs globally. The origin API sets Cache-Control
 * headers via httpCacheHeadersPlugin — this worker uses those headers
 * to store and serve cached responses.
 *
 * Why a Worker? CDNs don't cache POST requests by default. This worker
 * hashes the POST body to create a unique cache key, enabling edge
 * caching for GraphQL queries while letting mutations pass through.
 *
 * IMPORTANT: Only queries with @cacheControl directives on the server
 * will emit s-maxage headers and be cached here. Per-user queries
 * (positions, predictions, profile data) must NEVER have @cacheControl
 * set — they would serve one user's data to another. Only public,
 * shared data (markets, leaderboards, protocol stats) should be cached.
 */

interface Env {
  ORIGIN_URL: string;
}

/**
 * Returns true if the given pathname targets a cacheable GraphQL endpoint.
 *
 * Both the legacy `/graphql` endpoint and the `/v2/graphql` endpoint are
 * served by the same origin and use the same @cacheControl-driven caching
 * model, so both must pass through the edge cache. The per-user-query
 * caution still applies: only public queries carry @cacheControl and get
 * cached — user-specific queries never set it, so they are never stored.
 */
export function isCacheableGraphqlPath(pathname: string): boolean {
  return (
    pathname === '/graphql' ||
    pathname.startsWith('/graphql/') ||
    pathname === '/v2/graphql' ||
    pathname.startsWith('/v2/graphql/')
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Only cache POST requests to /graphql or /v2/graphql
    if (
      request.method !== 'POST' ||
      !isCacheableGraphqlPath(new URL(request.url).pathname)
    ) {
      return forwardToOrigin(request, env);
    }

    // Cache bypass: X-Cache-Bypass header or ?_nocache param
    if (
      request.headers.get('X-Cache-Bypass') === '1' ||
      new URL(request.url).searchParams.has('_nocache')
    ) {
      return forwardToOrigin(request, env);
    }

    // Defense-in-depth against cross-user cache poisoning: the cache key is the
    // request URL + body hash only and does NOT include auth headers. Caching is
    // *supposed* to be safe because per-user queries never set @cacheControl
    // (so the origin omits s-maxage and we don't store them). But that invariant
    // lives only in resolver annotations — a single mistake would let one user's
    // authed response be served to everyone. So we never read from or write to
    // the cache for any request that carries identity, regardless of s-maxage.
    if (hasAuthContext(request)) {
      return forwardToOrigin(request, env);
    }

    const body = await request.text();

    // Skip caching for mutations and for anything that isn't a single GraphQL
    // query object (e.g. batched array bodies, which isMutation can't inspect).
    if (!isSingleCacheableQuery(body) || isMutation(body)) {
      return forwardToOrigin(
        new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body,
        }),
        env
      );
    }

    // Build cache key from full SHA-256 hash of body
    const bodyHash = await hashBody(body);
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_body', bodyHash);
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

    const cache = caches.default;

    // Check cache
    const cached = await cache.match(cacheKey);
    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set('X-Cache', 'HIT');
      return response;
    }

    // Cache miss — forward to origin
    const originResponse = await forwardToOrigin(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
      }),
      env
    );

    // Only cache successful JSON responses with s-maxage
    if (!originResponse.ok) {
      return originResponse;
    }

    const contentType = originResponse.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return originResponse;
    }

    const cacheControl = originResponse.headers.get('Cache-Control');
    if (!cacheControl || !cacheControl.includes('s-maxage')) {
      return originResponse;
    }

    // Clone and store in cache
    const responseToCache = new Response(
      originResponse.clone().body,
      originResponse
    );
    responseToCache.headers.set('X-Cache', 'MISS');
    ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

    return responseToCache;
  },
};

async function forwardToOrigin(
  request: Request,
  env: Env
): Promise<Response> {
  const originUrl = new URL(request.url);
  const origin = new URL(env.ORIGIN_URL);
  originUrl.hostname = origin.hostname;
  originUrl.port = origin.port;
  originUrl.protocol = origin.protocol;

  return fetch(
    new Request(originUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? request.body
          : undefined,
    })
  );
}

/**
 * True if the request carries any per-identity context. Such requests must
 * bypass the shared edge cache entirely so one caller's response is never
 * stored under a key another caller could hit.
 */
function hasAuthContext(request: Request): boolean {
  return (
    request.headers.has('Authorization') ||
    request.headers.has('Cookie') ||
    request.headers.has('x-admin-signature')
  );
}

/**
 * True only for a single GraphQL operation object (`{ query: "..." }`).
 * Batched requests (a JSON array of operations) return false so they are
 * never cached — isMutation only inspects a single `query` field and would
 * otherwise let a batch containing a mutation slip through as cacheable.
 */
function isSingleCacheableQuery(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { query?: unknown }).query === 'string'
    );
  } catch {
    return false;
  }
}

function isMutation(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { query?: string };
    const query = parsed.query?.trim();
    if (!query) return false;
    return /^\s*mutation[\s({]/i.test(query);
  } catch {
    return false;
  }
}

async function hashBody(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
