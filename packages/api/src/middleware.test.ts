import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Reset modules before EVERY test to get fresh rate limiter instances
beforeEach(() => {
  vi.resetModules();
});

// ─── Rate limiting ──────────────────────────────────────────────────────────

describe('rate limiting with trust proxy', () => {
  it('rate limits per-IP using X-Forwarded-For, not globally', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 3,
      },
    }));

    const { createApp } = await import('./app');
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
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 3,
      },
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });

  it('rate-limited responses include standard rate limit headers', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 2,
      },
    }));

    const { createApp } = await import('./app');
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
