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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Only cache POST requests to /graphql
    if (
      request.method !== 'POST' ||
      !new URL(request.url).pathname.startsWith('/graphql')
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

    const body = await request.text();

    // Skip caching for mutations
    if (isMutation(body)) {
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
