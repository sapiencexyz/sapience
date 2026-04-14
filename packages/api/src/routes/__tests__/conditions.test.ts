import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Tests for condition creation validation.
 *
 * Ensures resolver is required when creating conditions — no more null
 * resolvers sneaking into the database because a caller forgot to set it.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  condition: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
  },
  conditionGroup: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../db', () => ({ default: mockPrisma }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a valid condition payload — all required fields present */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    conditionHash: '0x' + 'ab'.repeat(32),
    question: 'Will BTC hit $200k by end of 2026?',
    endTime: Math.floor(Date.now() / 1000) + 86400, // tomorrow
    description: 'Test condition',
    resolver: '0x7E81CA51dE1eECc5eD4F7eCBAA3156400C6B3b9C',
    ...overrides,
  };
}

// ─── App setup ───────────────────────────────────────────────────────────────

import { router as conditionsRouter } from '../conditions';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/conditions', conditionsRouter);
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /admin/conditions', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockPrisma.condition.create.mockResolvedValue({
      id: '0x' + 'ab'.repeat(32),
      question: 'test',
      endTime: 9999999999,
      description: 'test',
      resolver: '0x7e81ca51de1eecc5ed4f7ecbaa3156400c6b3b9c',
      public: true,
      chainId: 42161,
      createdAt: new Date(),
    });
  });

  // ─── Resolver validation ─────────────────────────────────────────────

  describe('resolver validation', () => {
    it('rejects request with no resolver field', async () => {
      const payload = validPayload();
      delete (payload as Record<string, unknown>).resolver;

      const res = await request(app).post('/admin/conditions').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/resolver/i);
    });

    it('rejects request with null resolver', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ resolver: null }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/resolver/i);
    });

    it('rejects request with empty string resolver', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ resolver: '' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/resolver/i);
    });

    it('rejects request with invalid address format', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ resolver: 'not-an-address' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/resolver/i);
    });

    it('rejects request with short address', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ resolver: '0x1234' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/resolver/i);
    });

    it('accepts request with valid resolver address', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload());

      expect(res.status).toBe(201);
      expect(mockPrisma.condition.create).toHaveBeenCalledOnce();
      // Verify resolver is lowercased in the DB call
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.resolver).toBe(
        '0x7e81ca51de1eecc5ed4f7ecbaa3156400c6b3b9c'
      );
    });
  });
});
