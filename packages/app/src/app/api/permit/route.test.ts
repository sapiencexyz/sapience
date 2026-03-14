import { vi } from 'vitest';
import { GET, OPTIONS } from './route';

describe('api/permit edge route', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns permitted true when IPINFO_TOKEN is not set', async () => {
    delete process.env.IPINFO_TOKEN;
    const req = new Request('http://localhost/api/permit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: true, country: null });
  });

  it('handles CORS preflight', () => {
    const req = new Request('http://localhost/api/permit', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com' },
    });
    const res = OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://example.com'
    );
  });

  // =========================================================================
  // Geofence IP-based tests
  // =========================================================================

  it('returns permitted false for restricted country (US)', async () => {
    process.env.IPINFO_TOKEN = 'test-token';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ country: 'US' }),
    });

    const req = new Request('http://localhost/api/permit', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: false, country: 'US' });
  });

  it('returns permitted true for allowed country (DE)', async () => {
    process.env.IPINFO_TOKEN = 'test-token';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ country: 'DE' }),
    });

    const req = new Request('http://localhost/api/permit', {
      headers: { 'x-forwarded-for': '5.6.7.8' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: true, country: 'DE' });
  });

  it('returns permitted false when no IP in headers (fail-safe)', async () => {
    process.env.IPINFO_TOKEN = 'test-token';
    const req = new Request('http://localhost/api/permit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: false, country: null });
  });

  it('returns permitted false when ipinfo.io API fails (fail-safe)', async () => {
    process.env.IPINFO_TOKEN = 'test-token';
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const req = new Request('http://localhost/api/permit', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: false, country: null });
  });

  it('returns permitted false when FORCE_GEOFENCE_LOCAL is set', async () => {
    process.env.FORCE_GEOFENCE_LOCAL = '1';
    // NODE_ENV is 'test' by default in vitest, which is !== 'production'
    const req = new Request('http://localhost/api/permit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permitted: false, country: null });
  });

  it('extracts first IP from x-forwarded-for with multiple IPs', async () => {
    process.env.IPINFO_TOKEN = 'test-token';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ country: 'DE' }),
    });

    const req = new Request('http://localhost/api/permit', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
    });
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ipinfo.io/1.2.3.4?token=test-token'
    );
  });
});
