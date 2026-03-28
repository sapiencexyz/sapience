import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Default x402 mock that includes all exports used by middleware
function defaultX402Mock() {
  return {
    createX402Middleware: vi.fn(() => {
      return (_req: Request, _res: Response, next: NextFunction) => next();
    }),
    calculateGraphQLComplexity: vi.fn(() => 0),
    USDC_ARBITRUM: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  };
}

// Default creditSessions mock — no active sessions
function defaultCreditSessionsMock() {
  return {
    createCreditSession: vi.fn(),
    getSession: vi.fn(() => null),
    deductCredits: vi.fn(() => null),
    extractPayerFromPaymentHeader: vi.fn(() => null),
    _resetForTest: vi.fn(),
  };
}

const TEST_PAY_TO = '0x1234567890abcdef1234567890abcdef12345678';

/** Assert that a 402 response body contains all x402 payment fields an agent needs. */
function expectPaymentFields(body: Record<string, unknown>) {
  const cs = body.creditSession as Record<string, unknown>;
  expect(cs).toBeDefined();
  expect(cs.protocol).toBe('x402');
  expect(cs.scheme).toBe('exact');
  expect(cs.network).toBe('eip155:42161');
  expect(cs.payTo).toBe(TEST_PAY_TO);
  expect(cs.asset).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
  const bundle = cs.bundle as Record<string, unknown>;
  expect(bundle.amount).toBe('1000000');
  expect(bundle.currency).toBe('USDC');
  expect(bundle.decimals).toBe(6);
  expect(bundle.amountUSD).toBe('$1.00');
  expect(bundle.credits).toBe(10_000);
  expect(cs.instructions).toBeDefined();
}

// Reset modules before EVERY test to get fresh rate limiter instances
beforeEach(() => {
  vi.resetModules();
});

// ─── Simple rate limiting (no x402) ─────────────────────────────────────────

describe('rate limiting with trust proxy (simple mode)', () => {
  it('rate limits per-IP using X-Forwarded-For, not globally', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 3,
        X402_PAY_TO: undefined,
      },
    }));
    vi.doMock('./x402', () => defaultX402Mock());
    vi.doMock('./creditSessions', () => defaultCreditSessionsMock());

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
        FREE_TIER_RATE_LIMIT: 3,
        X402_PAY_TO: undefined,
      },
    }));
    vi.doMock('./x402', () => defaultX402Mock());
    vi.doMock('./creditSessions', () => defaultCreditSessionsMock());

    const { createApp } = await import('./app');
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });
});

// ─── Tiered rate limiting (with x402) ───────────────────────────────────────

describe('tiered rate limiting with trust proxy (x402 mode)', () => {
  it('free tier exhaustion is per-IP — other IPs are not pushed to payment', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 3,
        X402_PAY_TO: TEST_PAY_TO,
        X402_CREDIT_BUNDLE_USDC: 1_000_000,
        X402_CREDIT_BUNDLE_SIZE: 10_000,
      },
    }));
    vi.doMock('./creditSessions', () => defaultCreditSessionsMock());
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => {
        return (req: Request, res: Response, next: NextFunction) => {
          if (!req.headers['payment-signature']) {
            res.status(402).json({ error: 'Payment Required' });
            return;
          }
          next();
        };
      }),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust free tier for IP 1.2.3.4
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get('/test')
        .set('X-Forwarded-For', '1.2.3.4');
      expect(res.status).toBe(200);
    }

    // 1.2.3.4 should now get 402 with credit session instructions
    const paymentRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4');
    expect(paymentRes.status).toBe(402);
    expectPaymentFields(paymentRes.body);

    // 5.6.7.8 should still get 200 — NOT pushed to payment by someone else's usage
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '5.6.7.8');
    expect(otherRes.status).toBe(200);
  });

  it('free tier exceeded returns 402 — users can always pay for access', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 5,
        X402_PAY_TO: TEST_PAY_TO,
        X402_CREDIT_BUNDLE_USDC: 1_000_000,
        X402_CREDIT_BUNDLE_SIZE: 10_000,
      },
    }));
    vi.doMock('./creditSessions', () => defaultCreditSessionsMock());
    vi.doMock('./x402', () => defaultX402Mock());

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust free tier for IP 10.0.0.1
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '10.0.0.1');
    }

    // 10.0.0.1 should get 402 with payment instructions, never 429
    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(blockedRes.status).toBe(402);
    expectPaymentFields(blockedRes.body);

    // 10.0.0.2 should still be fine
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '10.0.0.2');
    expect(otherRes.status).toBe(200);
  });

  it('exhausted credit session returns 402 with exhausted status', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 2,
        X402_PAY_TO: TEST_PAY_TO,
        X402_CREDIT_BUNDLE_USDC: 1_000_000,
        X402_CREDIT_BUNDLE_SIZE: 10_000,
      },
    }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: vi.fn(() => ({
        wallet: '0xabc',
        credits: 0,
      })),
      deductCredits: vi.fn(() => null), // exhausted
    }));
    vi.doMock('./x402', () => defaultX402Mock());

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Send request with exhausted credit session — should get 402, not 429
    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '10.0.0.1')
      .set('X-Credit-Session', 'exhausted-token');

    expect(res.status).toBe(402);
    expectPaymentFields(res.body);
    expect(res.body.creditSession.status).toBe('exhausted');
  });
});

// ─── Credit sessions ─────────────────────────────────────────────────────────

describe('credit sessions', () => {
  const X402_CONFIG = {
    isProd: false,
    RATE_LIMIT_WINDOW_MS: 60000,
    FREE_TIER_RATE_LIMIT: 2,
    X402_PAY_TO: '0x1234567890abcdef1234567890abcdef12345678',
    X402_CREDIT_BUNDLE_USDC: 1_000_000,
    X402_CREDIT_BUNDLE_SIZE: 10_000,
  };

  it('valid credit session bypasses x402 and deducts credits', async () => {
    const mockGetSession = vi.fn(() => ({
      wallet: '0xabc',
      credits: 50000,
    }));
    const mockDeductCredits = vi.fn(() => 49999);

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: mockGetSession,
      deductCredits: mockDeductCredits,
    }));

    const x402Mock = vi.fn();
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => x402Mock),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('X-Credit-Session', 'valid-token-abc');

    expect(res.status).toBe(200);
    expect(mockDeductCredits).toHaveBeenCalledWith('valid-token-abc', 1);
    // x402 should NOT have been called
    expect(x402Mock).not.toHaveBeenCalled();
    expect(res.headers['x-credits-remaining']).toBeDefined();
  });

  it('invalid session token returns 402 with exhausted status', async () => {
    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: vi.fn(() => null), // unknown token
    }));

    const x402Mock = vi.fn();
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => x402Mock),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('X-Credit-Session', 'unknown-token');

    expect(res.status).toBe(402);
    expect(res.headers['x-credit-session-status']).toBe('exhausted');
    expectPaymentFields(res.body);
    expect(res.body.creditSession.status).toBe('exhausted');
    expect(res.body.creditSession.pricing).toContain('10,000 credits');
    expect(res.body.creditSession.instructions.step1).toContain(
      'Payment-Signature'
    );
    expect(res.body.creditSession.instructions.step3).toContain(
      'X-Credit-Session'
    );
    // x402 should NOT have been called — we sent our own 402
    expect(x402Mock).not.toHaveBeenCalled();
  });

  it('successful payment creates credit session and returns token header', async () => {
    const mockCreateCreditSession = vi.fn(() => ({
      token: 'new-session-token',
      credits: 10_000,
    }));

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      createCreditSession: mockCreateCreditSession,
      extractPayerFromPaymentHeader: vi.fn(() => '0xpayer'),
    }));

    // x402 mock that calls next() on payment success (simulates valid payment)
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => {
        return (_req: Request, _res: Response, next: NextFunction) => {
          next();
        };
      }),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust free tier
    for (let i = 0; i < 2; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '2.2.2.2');
    }

    // Next request has payment header — should trigger credit session creation
    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '2.2.2.2')
      .set(
        'Payment-Signature',
        Buffer.from(
          JSON.stringify({ authorization: { from: '0xpayer' } })
        ).toString('base64')
      );

    expect(res.status).toBe(200);
    expect(res.headers['x-credit-session']).toBe('new-session-token');
    expect(res.headers['x-credits-remaining']).toBe('10000');
    expect(mockCreateCreditSession).toHaveBeenCalledWith('0xpayer', 10_000);
  });

  it('credits exhausted returns 402 with exhausted status and bundle info', async () => {
    const mockGetSession = vi.fn(() => ({
      wallet: '0xabc',
      credits: 0, // not enough
    }));

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: mockGetSession,
      deductCredits: vi.fn(() => null), // insufficient credits
    }));

    const x402Mock = vi.fn();
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => x402Mock),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('X-Credit-Session', 'exhausted-token');

    expect(res.status).toBe(402);
    expect(res.headers['x-credit-session-status']).toBe('exhausted');
    expectPaymentFields(res.body);
    expect(res.body.creditSession.status).toBe('exhausted');
    expect(res.body.creditSession.instructions.step1).toContain(
      'Payment-Signature'
    );
    expect(res.body.creditSession.instructions.step3).toContain(
      'X-Credit-Session'
    );
    expect(res.body.message).toContain('run out of credits');
    // x402 should NOT have been called — we sent our own 402
    expect(x402Mock).not.toHaveBeenCalled();
  });

  it('credit sessions are per-token, not shared across IPs', async () => {
    let sessionCreditsA = 50000;
    const mockGetSession = vi.fn((token: string) => {
      if (token === 'token-a') {
        return {
          wallet: '0xaaa',
          credits: sessionCreditsA,
        };
      }
      return null; // token-b is unknown
    });
    const mockDeductCredits = vi.fn((token: string) => {
      if (token === 'token-a') {
        sessionCreditsA -= 1;
        return sessionCreditsA;
      }
      return null;
    });

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: mockGetSession,
      deductCredits: mockDeductCredits,
    }));

    const x402Mock = vi.fn(
      (_req: Request, res: Response, _next: NextFunction) => {
        res.status(402).json({ error: 'Payment Required' });
      }
    );
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => x402Mock),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // IP A with valid token-a → 200 (credits deducted)
    const resA = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '4.4.4.4')
      .set('X-Credit-Session', 'token-a');
    expect(resA.status).toBe(200);
    expect(mockDeductCredits).toHaveBeenCalledWith('token-a', 1);

    // Exhaust free tier for IP B
    for (let i = 0; i < 2; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '5.5.5.5');
    }

    // IP B with invalid token-b → invalid session, free tier exhausted → 402
    const resB = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '5.5.5.5')
      .set('X-Credit-Session', 'token-b');
    expect(resB.status).toBe(402);

    // token-a's credits were deducted; token-b never had credits
    expect(mockDeductCredits).not.toHaveBeenCalledWith(
      'token-b',
      expect.anything()
    );
  });

  it('malformed query (NaN/Infinity complexity) still gets valid numeric cost', async () => {
    const mockGetSession = vi.fn(() => ({
      wallet: '0xabc',
      credits: 50000,
    }));
    const mockDeductCredits = vi.fn(() => 49999);

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      getSession: mockGetSession,
      deductCredits: mockDeductCredits,
    }));
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      // Return NaN to simulate the bug
      calculateGraphQLComplexity: vi.fn(() => NaN),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.post('/graphql', (_req, res) => res.json({ data: {} }));

    const res = await request(app)
      .post('/graphql')
      .set('X-Credit-Session', 'valid-token')
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    // Math.max(1, NaN) = NaN, but our guard ensures complexity always returns finite
    // so deductCredits should be called with 1 (the minimum)
    expect(mockDeductCredits).toHaveBeenCalledWith('valid-token', 1);
  });

  it('session creation failure after payment sets error header but still succeeds', async () => {
    const mockCreateCreditSession = vi.fn(() => {
      throw new Error('DB connection failed');
    });

    vi.doMock('./config', () => ({ config: X402_CONFIG }));
    vi.doMock('./creditSessions', () => ({
      ...defaultCreditSessionsMock(),
      createCreditSession: mockCreateCreditSession,
      extractPayerFromPaymentHeader: vi.fn(() => '0xpayer'),
    }));

    // x402 mock that calls next() on payment success
    vi.doMock('./x402', () => ({
      ...defaultX402Mock(),
      createX402Middleware: vi.fn(() => {
        return (_req: Request, _res: Response, next: NextFunction) => {
          next();
        };
      }),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust free tier
    for (let i = 0; i < 2; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '3.3.3.3');
    }

    // Payment succeeds but session creation fails
    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '3.3.3.3')
      .set(
        'Payment-Signature',
        Buffer.from(
          JSON.stringify({ authorization: { from: '0xpayer' } })
        ).toString('base64')
      );

    expect(res.status).toBe(200);
    expect(res.headers['x-credit-session-error']).toBe('creation_failed');
    // No session token should be set
    expect(res.headers['x-credit-session']).toBeUndefined();
  });
});
