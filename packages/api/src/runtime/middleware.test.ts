import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Reset modules before EVERY test to get fresh rate limiter instances
beforeEach(() => {
  vi.resetModules();
});

// ─── CORS ────────────────────────────────────────────────────────────────────

describe('CORS origin allowlist', () => {
  it('allows local LAN Vite dev origins only when explicitly enabled', async () => {
    const { isAllowedCorsOrigin } = await import('./middleware');

    expect(
      isAllowedCorsOrigin('https://192.168.1.42:5173', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(true);
    expect(
      isAllowedCorsOrigin('http://10.0.0.8:5173', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(true);
    expect(
      isAllowedCorsOrigin('https://172.16.0.12:5173', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(true);
    expect(isAllowedCorsOrigin('https://127.0.0.1:5173')).toBe(true);
  });

  it('rejects non-private hosts and non-dev ports', async () => {
    const { isAllowedCorsOrigin } = await import('./middleware');

    expect(isAllowedCorsOrigin('https://192.168.1.42:5173')).toBe(false);
    expect(isAllowedCorsOrigin('https://192.168.1.42:3000')).toBe(false);
    expect(
      isAllowedCorsOrigin('https://192.168.1.42:3000', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(false);
    expect(
      isAllowedCorsOrigin('https://172.32.0.12:5173', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(false);
    expect(
      isAllowedCorsOrigin('https://8.8.8.8:5173', {
        allowPrivateLanDevOrigins: true,
      })
    ).toBe(false);
    expect(isAllowedCorsOrigin('https://evil.example:5173')).toBe(false);
  });

  it('allows combo-bingo.vercel.app in all environments', async () => {
    const { isAllowedCorsOrigin } = await import('./middleware');

    expect(isAllowedCorsOrigin('https://combo-bingo.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('http://combo-bingo.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://combo-bingo-evil.vercel.app')).toBe(
      false
    );
  });

  it('allows combo-bingo preflight on production API host', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: true,
        NODE_ENV: 'production',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 100,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    const origin = 'https://combo-bingo.vercel.app';

    const prodRes = await request(app)
      .options('/graphql')
      .set('Host', 'api.sapience.xyz')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    expect(prodRes.status).toBe(200);
    expect(prodRes.headers['access-control-allow-origin']).toBe(origin);
  });

  it('allows LAN dev preflight on staging API host only', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: true,
        NODE_ENV: 'production',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 100,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    const origin = 'https://192.168.1.42:5173';

    const stagingRes = await request(app)
      .options('/graphql')
      .set('Host', 'api.staging.sapience.xyz')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    expect(stagingRes.status).toBe(200);
    expect(stagingRes.headers['access-control-allow-origin']).toBe(origin);

    const prodRes = await request(app)
      .options('/graphql')
      .set('Host', 'api.sapience.xyz')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    expect(prodRes.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// ─── Admin auth ───────────────────────────────────────────────────────────────

describe('adminAuth environment gating', () => {
  it('bypasses auth only in development, not staging', async () => {
    // Staging: isDev=false, isProd=false. Must NOT bypass.
    vi.doMock('../core/config', () => ({
      config: { isDev: false, isProd: false, NODE_ENV: 'staging' },
    }));

    const express = (await import('express')).default;
    const { adminAuth } = await import('./middleware');
    const app = express();
    app.get('/admin/test', adminAuth, (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/admin/test');
    expect(res.status).toBe(401);
  });

  it('rejects production admin requests without a signature', async () => {
    vi.doMock('../core/config', () => ({
      config: { isDev: false, isProd: true, NODE_ENV: 'production' },
    }));

    const express = (await import('express')).default;
    const { adminAuth } = await import('./middleware');
    const app = express();
    app.get('/admin/test', adminAuth, (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/admin/test');
    expect(res.status).toBe(401);
  });

  it('bypasses auth in development', async () => {
    vi.doMock('../core/config', () => ({
      config: { isDev: true, isProd: false, NODE_ENV: 'development' },
    }));

    const express = (await import('express')).default;
    const { adminAuth } = await import('./middleware');
    const app = express();
    app.get('/admin/test', adminAuth, (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/admin/test');
    expect(res.status).toBe(200);
  });
});

describe('CORS staging origin enforcement', () => {
  it('does not allow arbitrary origins on staging', async () => {
    // Staging: isDev=false, isProd=false. Must enforce the origin allowlist
    // instead of reflecting any origin.
    vi.doMock('../core/config', () => ({
      config: {
        isDev: false,
        isProd: false,
        NODE_ENV: 'staging',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 100,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();

    const res = await request(app)
      .options('/graphql')
      .set('Host', 'api.staging.sapience.xyz')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows sapience.xyz origins on staging', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isDev: false,
        isProd: false,
        NODE_ENV: 'staging',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 100,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    const origin = 'https://app.staging.sapience.xyz';

    const res = await request(app)
      .options('/graphql')
      .set('Host', 'api.staging.sapience.xyz')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });
});

// ─── Rate limiting ──────────────────────────────────────────────────────────

describe('rate limiting with trust proxy', () => {
  it('rate limits per-IP using X-Forwarded-For, not globally', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 3,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust the limit for IP 1.2.3.4
    for (let i = 0; i < 3; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '1.2.3.4');
    }

    // 1.2.3.4 should now be rate-limited
    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4');
    expect(blockedRes.status).toBe(429);

    // 5.6.7.8 should NOT be affected
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '5.6.7.8');
    expect(otherRes.status).toBe(200);
  });

  it('app has trust proxy enabled', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 3,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });

  it('rate-limited responses include standard rate limit headers', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 2,
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '1.2.3.4');
    }

    // Next request should be rate-limited with headers
    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(blockedRes.headers['ratelimit-limit']).toBeDefined();
    expect(blockedRes.headers['ratelimit-remaining']).toBe('0');
  });
});

describe('internal rate-limit bypass token', () => {
  it('skips rate limiting when x-internal-token matches the configured secret', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 2,
        INTERNAL_RATE_LIMIT_BYPASS_TOKEN: 'internal-secret',
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Well past the limit of 2 — every request should still succeed
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/test')
        .set('X-Forwarded-For', '1.2.3.4')
        .set('x-internal-token', 'internal-secret');
      expect(res.status).toBe(200);
    }
  });

  it('still rate limits requests with a wrong or missing token', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 2,
        INTERNAL_RATE_LIMIT_BYPASS_TOKEN: 'internal-secret',
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 2; i++) {
      await request(app)
        .get('/test')
        .set('X-Forwarded-For', '1.2.3.4')
        .set('x-internal-token', 'wrong-secret');
    }

    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4')
      .set('x-internal-token', 'wrong-secret');
    expect(blockedRes.status).toBe(429);
  });

  it('cannot bypass when no token is configured, even with an empty header', async () => {
    vi.doMock('../core/config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 2,
        INTERNAL_RATE_LIMIT_BYPASS_TOKEN: '',
      },
    }));

    const { createApp } = await import('../core/app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // An empty header must not match the empty default — that would
    // turn "feature off" into "bypass for everyone"
    for (let i = 0; i < 2; i++) {
      await request(app)
        .get('/test')
        .set('X-Forwarded-For', '1.2.3.4')
        .set('x-internal-token', '');
    }

    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4')
      .set('x-internal-token', '');
    expect(blockedRes.status).toBe(429);
  });
});
