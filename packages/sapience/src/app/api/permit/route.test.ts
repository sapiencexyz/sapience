import { GET, OPTIONS } from './route';

describe('api/permit edge route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
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
    expect(body).toEqual({ permitted: true });
  });

  it('handles CORS preflight', async () => {
    const req = new Request('http://localhost/api/permit', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com' },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');
  });
});


