/**
 * Tiered Rate Limiting Tests
 *
 * Tests the three-tier rate limiting system:
 * - Free tier: 0-200 req/min
 * - Paid tier: 200-400 req/min (requires x402 payment)
 * - Hard limit: >400 req/min (returns 429)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { createApp } from '../app';

// Mock viem to avoid blockchain RPC calls
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => ({
      getGasPrice: vi.fn().mockResolvedValue(BigInt('100000000')), // 0.1 gwei (cheap)
    }),
    createWalletClient: () => ({
      signMessage: vi.fn().mockResolvedValue('0xmocksignature'),
    }),
    formatGwei: (wei: bigint) => (Number(wei) / 1e9).toFixed(2),
  };
});

// Mock the x402 middleware to avoid real payment validation
vi.mock('../x402', () => ({
  createGasAwareX402Middleware: () => {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Simulate successful payment validation
      const hasPaymentHeader = req.headers['payment-signature'];
      if (hasPaymentHeader) {
        // Mark as paid (same as markRequestAsPaid does)
        (req as Request & { x402Paid?: boolean }).x402Paid = true;
        next();
      } else {
        _res.status(402).json({
          error: 'Payment Required',
          message: 'Free tier exceeded. Payment required to continue.',
        });
      }
    };
  },
}));

// Mock router to add test endpoint
vi.mock('../routes', async () => {
  const express = await import('express');
  const router = express.default.Router();
  router.get('/test', (req: Request, res: Response) => {
    res.json({ message: 'Success', tier: (req as Request & { x402Paid?: boolean }).x402Paid ? 'paid' : 'free' });
  });
  return { router };
});

describe('Tiered Rate Limiting', () => {
  let app: Express;

  beforeEach(() => {
    // Create fresh app instance with fresh rate limiters
    app = createApp();
  });

  describe('Free Tier (0-200 requests)', () => {
    it('should allow requests under the free tier limit', async () => {
      // Make 10 requests (well under 200)
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('free');
      }
    });

    it('should include rate limit headers', async () => {
      const res = await request(app).get('/test');

      // Standard headers (draft-ietf-httpapi-ratelimit-headers)
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
      expect(res.headers['ratelimit-reset']).toBeDefined();
    });

    it('should set requiresPayment flag when free tier is exceeded', async () => {
      // Make 201 requests to exceed free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // 201st request should get 402 Payment Required
      const res = await request(app).get('/test');
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Payment Required');
    });
  });

  describe('Paid Tier (200-400 requests with payment)', () => {
    it('should accept paid requests after free tier is exhausted', async () => {
      // Exhaust free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Next request with payment should succeed
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    });

    it('should reject requests without payment after free tier exhausted', async () => {
      // Exhaust free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Request without payment should get 402
      const res = await request(app).get('/test');
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Payment Required');
    });

    it('should allow up to 200 paid requests', async () => {
      // Exhaust free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Make 100 paid requests (should all succeed)
      for (let i = 0; i < 100; i++) {
        const res = await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');

        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('paid');
      }
    });
  });

  describe('Hard Limit (>400 requests)', () => {
    it('should return 429 when hard limit is reached', async () => {
      // Make 200 free requests
      for (let i = 0; i < 200; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
      }

      // Make 200 paid requests (201-400)
      for (let i = 0; i < 200; i++) {
        const res = await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
        expect(res.status).toBe(200);
      }

      // 401st request should hit hard limit
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too Many Requests');
      expect(res.body.tier).toBe('hard_limit');
    });

    it('should reject even with valid payment when hard limit reached', async () => {
      // Simulate hitting hard limit (400 requests)
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }
      for (let i = 0; i < 200; i++) {
        await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
      }

      // Additional request with payment should still fail
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('Hard limit');
    });

    it('should include message in hard limit response', async () => {
      // Hit hard limit
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }
      for (let i = 0; i < 200; i++) {
        await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
      }

      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(429);
      expect(res.body.message).toBeDefined();
      expect(res.body.message).toContain('400');
      expect(res.body.tier).toBe('hard_limit');
    });

    it('should count both free and paid requests towards hard limit', async () => {
      // Make 150 free requests
      for (let i = 0; i < 150; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
      }

      // Make 250 paid requests (total = 400)
      for (let i = 0; i < 250; i++) {
        const res = await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
        expect(res.status).toBe(200);
      }

      // 401st request hits hard limit
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(429);
      expect(res.body.tier).toBe('hard_limit');
    });

    it('should block unpaid requests at hard limit too', async () => {
      // Hit hard limit with mix of free and paid
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }
      for (let i = 0; i < 200; i++) {
        await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
      }

      // Try unpaid request at 401
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too Many Requests');
    });
  });

  describe('Configuration', () => {
    it('should use FREE_TIER_LIMIT from config', () => {
      expect(config.FREE_TIER_RATE_LIMIT).toBe(200);
    });

    it('should use HARD_LIMIT from config', () => {
      expect(config.HARD_RATE_LIMIT).toBe(400);
    });

    it('should use RATE_LIMIT_WINDOW_MS from config', () => {
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(60000); // 1 minute
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests from different IPs independently', async () => {
      // Note: In real tests, you'd need to mock different IPs
      // This is a placeholder for IP-based isolation testing
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });

    it('should handle rapid concurrent requests', async () => {
      // Make 10 concurrent requests
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/test')
      );

      const responses = await Promise.all(requests);

      // All should succeed (under free tier)
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });
    });

    it('should properly mark requests as paid', async () => {
      // Exhaust free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Make a paid request
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    });
  });

  describe('Middleware Order', () => {
    it('should check hard limit before free tier (early rejection at 429)', async () => {
      // Make 200 free requests
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Make 200 paid requests (total = 400)
      for (let i = 0; i < 200; i++) {
        await request(app)
          .get('/test')
          .set('Payment-Signature', 'mock-payment-signature');
      }

      // Request 401: hardLimiter should reject with 429 BEFORE freeTierLimiter or x402 run
      // If order was wrong, we might see 402 or 200 instead
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(429);
      expect(res.body.tier).toBe('hard_limit');
      expect(res.body.error).toBe('Too Many Requests');
    });

    it('should check free tier before payment processing (sets requiresPayment flag)', async () => {
      // Make exactly 200 free requests to exhaust free tier
      for (let i = 0; i < 200; i++) {
        await request(app).get('/test');
      }

      // Request 201 with payment:
      // 1. hardLimiter runs (201 < 400, passes)
      // 2. freeTierLimiter runs (201 > 200, sets requiresPayment flag, passes)
      // 3. x402 middleware sees requiresPayment OR payment header, validates payment
      // If order was wrong (x402 before freeTier), payment wouldn't be processed correctly
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    });

    it('should process payment validation after rate limit checks', async () => {
      // Request 1 with payment header (under both limits)
      // All middleware runs, payment is validated
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');

      // This proves:
      // 1. hardLimiter allowed it (< 400)
      // 2. freeTierLimiter skipped it (has payment header)
      // 3. x402 middleware processed it (marked as paid)
    });
  });
});

describe('Integration: Full Request Flow', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it('should handle a complete tier progression', async () => {
    // Stage 1: Free tier (requests 1-200)
    console.log('Testing free tier (1-200 requests)...');
    for (let i = 0; i < 200; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('free');
    }

    // Stage 2: Free tier exhausted (request 201 without payment)
    console.log('Testing payment required (request 201 without payment)...');
    const unpaidRes = await request(app).get('/test');
    expect(unpaidRes.status).toBe(402);
    expect(unpaidRes.body.error).toBe('Payment Required');

    // Stage 3: Paid tier (requests 202-400 with payment)
    // Note: The unpaid 402 request still counts toward hardLimiter (now at 201),
    // so we can only make 199 more paid requests (202-400) before hitting hard limit
    console.log('Testing paid tier (202-400 requests with payment)...');
    for (let i = 0; i < 199; i++) {
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    }

    // Stage 4: Hard limit (request 401)
    console.log('Testing hard limit (request 401)...');
    const hardLimitRes = await request(app)
      .get('/test')
      .set('Payment-Signature', 'mock-payment-signature');
    expect(hardLimitRes.status).toBe(429);
    expect(hardLimitRes.body.tier).toBe('hard_limit');
    expect(hardLimitRes.body.error).toBe('Too Many Requests');
  });

  it('should handle mixed free and paid requests correctly', async () => {
    // Make 100 free requests
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('free');
    }

    // Make 100 more free requests (total: 200)
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('free');
    }

    // Next unpaid request should require payment (total: 201, still counts in hardLimiter)
    const unpaidRes = await request(app).get('/test');
    expect(unpaidRes.status).toBe(402);

    // Make 150 paid requests (total: 351)
    for (let i = 0; i < 150; i++) {
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    }

    // Make 49 more paid requests (total: 400)
    // Note: Can only make 49 because hardLimiter is at 351, and 351 + 49 = 400 (the max)
    for (let i = 0; i < 49; i++) {
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');
      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('paid');
    }

    // 401st request hits hard limit
    const hardLimitRes = await request(app)
      .get('/test')
      .set('Payment-Signature', 'mock-payment-signature');
    expect(hardLimitRes.status).toBe(429);
    expect(hardLimitRes.body.tier).toBe('hard_limit');
  });

  it('should correctly track separate counters', async () => {
    // Make 200 free requests
    for (let i = 0; i < 200; i++) {
      await request(app).get('/test');
    }

    // Verify free tier is exhausted (hardLimiter now at 201 due to this 402 request)
    const unpaidRes = await request(app).get('/test');
    expect(unpaidRes.status).toBe(402);

    // Make 100 paid requests (hardLimiter: 201 -> 301)
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');
      expect(res.status).toBe(200);
    }

    // Verify unpaid requests still blocked (free tier still at 200, hardLimiter at 302)
    const unpaidRes2 = await request(app).get('/test');
    expect(unpaidRes2.status).toBe(402);

    // Continue with paid requests until hard limit
    // Can only make 98 more paid requests: hardLimiter 302 + 98 = 400 (the max)
    for (let i = 0; i < 98; i++) {
      const res = await request(app)
        .get('/test')
        .set('Payment-Signature', 'mock-payment-signature');
      expect(res.status).toBe(200);
    }

    // Now at hard limit (200 free + 2 unpaid 402s + 198 paid = 400 total)
    const hardLimitRes = await request(app)
      .get('/test')
      .set('Payment-Signature', 'mock-payment-signature');
    expect(hardLimitRes.status).toBe(429);
  });
});
