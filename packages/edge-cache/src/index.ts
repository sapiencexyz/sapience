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
    if (request.method !== 'POST' || !new URL(request.url).pathname.startsWith('/graphql')) {
      return forwardToOrigin(request, env);
    }

    const body = await request.text();

    // Skip caching for mutations
    if (isMutation(body)) {
      return forwardToOrigin(new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
      }), env);
    }

    // Build cache key from body hash
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
    const originResponse = await forwardToOrigin(new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body,
    }), env);

    // Only cache successful responses with cache-control headers
    if (!originResponse.ok) {
      return originResponse;
    }

    const cacheControl = originResponse.headers.get('Cache-Control');
    if (!cacheControl || !cacheControl.includes('s-maxage')) {
      // Origin says don't cache (no s-maxage) — pass through
      return originResponse;
    }

    // Clone and store in cache
    const responseToCache = new Response(originResponse.clone().body, originResponse);
    responseToCache.headers.set('X-Cache', 'MISS');

    // Cache API requires the response to have an explicit cache TTL.
    // The origin already set Cache-Control with s-maxage, so Cloudflare
    // Cache API will respect it.
    ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

    return responseToCache;
  },
};

async function forwardToOrigin(request: Request, env: Env): Promise<Response> {
  const originUrl = new URL(request.url);
  const origin = new URL(env.ORIGIN_URL);
  originUrl.hostname = origin.hostname;
  originUrl.port = origin.port;
  originUrl.protocol = origin.protocol;

  return fetch(new Request(originUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  }));
}

function isMutation(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { query?: string };
    const query = parsed.query?.trim();
    if (!query) return false;
    // Check if the query starts with "mutation" (with optional operation name)
    return /^\s*mutation[\s({]/i.test(query);
  } catch {
    return false;
  }
}

async function hashBody(body: string): Promise<string> {
  const data = new TextEncoder().encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
