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

  describe('optionName', () => {
    it('persists trimmed optionName on create', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ optionName: '  April 7  ' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBe('April 7');
    });

    it('leaves optionName undefined when omitted', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload());

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBeUndefined();
    });

    it('leaves optionName undefined when only whitespace', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(validPayload({ optionName: '   ' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBeUndefined();
    });
  });
});

describe('POST /admin/conditions/batch-create', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockPrisma.condition.create.mockResolvedValue({});
    mockPrisma.category.findFirst.mockResolvedValue(null);
    mockPrisma.conditionGroup.findFirst.mockResolvedValue(null);
  });

  it('persists optionName for every item in the batch', async () => {
    const items = [
      {
        conditionHash: '0x' + '11'.repeat(32),
        question: 'Will BTC reach $150k in April?',
        shortName: 'BTC ≥$150k Apr',
        optionName: '↑ 150,000',
        endTime: Math.floor(Date.now() / 1000) + 86400,
        description: 'test',
        resolver: '0x7E81CA51dE1eECc5eD4F7eCBAA3156400C6B3b9C',
      },
      {
        conditionHash: '0x' + '22'.repeat(32),
        question: 'Will BTC dip to $60k in April?',
        shortName: 'BTC ≤$60k Apr',
        optionName: '↓ 60,000',
        endTime: Math.floor(Date.now() / 1000) + 86400,
        description: 'test',
        resolver: '0x7E81CA51dE1eECc5eD4F7eCBAA3156400C6B3b9C',
      },
    ];

    const res = await request(app)
      .post('/admin/conditions/batch-create')
      .send({ conditions: items });

    expect(res.status).toBe(201);
    expect(mockPrisma.condition.create).toHaveBeenCalledTimes(2);
    const first = mockPrisma.condition.create.mock.calls[0][0].data;
    const second = mockPrisma.condition.create.mock.calls[1][0].data;
    expect(first.optionName).toBe('↑ 150,000');
    expect(second.optionName).toBe('↓ 60,000');
  });
});

describe('PUT /admin/conditions/:id', () => {
  let app: ReturnType<typeof buildApp>;
  const conditionId = '0x' + 'ab'.repeat(32);

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: conditionId,
      question: 'old question',
      shortName: 'old short',
      optionName: null,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      settled: false,
      chainId: 42161,
      categoryId: null,
    });
    mockPrisma.condition.update.mockResolvedValue({
      id: conditionId,
      question: 'updated',
      shortName: 'updated',
      optionName: 'April 7',
      createdAt: new Date(),
    });
  });

  it('updates optionName when provided', async () => {
    const res = await request(app)
      .put(`/admin/conditions/${conditionId}`)
      .send({ optionName: 'April 7' });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.condition.update.mock.calls[0][0];
    expect(updateCall.data.optionName).toBe('April 7');
  });

  it('clears optionName when empty string is provided', async () => {
    const res = await request(app)
      .put(`/admin/conditions/${conditionId}`)
      .send({ optionName: '' });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.condition.update.mock.calls[0][0];
    expect(updateCall.data.optionName).toBeNull();
  });

  it('leaves optionName untouched when not in body', async () => {
    const res = await request(app)
      .put(`/admin/conditions/${conditionId}`)
      .send({ question: 'new question' });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.condition.update.mock.calls[0][0];
    expect(updateCall.data.optionName).toBeUndefined();
  });
});

describe('PUT /admin/conditions/batch-metadata', () => {
  let app: ReturnType<typeof buildApp>;
  const id = '0x' + 'cd'.repeat(32);

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockPrisma.condition.update.mockResolvedValue({});
  });

  it('updates optionName when present in fields', async () => {
    const res = await request(app)
      .put('/admin/conditions/batch-metadata')
      .send({
        updates: [{ id, fields: { optionName: 'Viktor Orban' } }],
      });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.condition.update.mock.calls[0][0];
    expect(updateCall.data.optionName).toBe('Viktor Orban');
  });

  it('clears optionName with empty string', async () => {
    const res = await request(app)
      .put('/admin/conditions/batch-metadata')
      .send({
        updates: [{ id, fields: { optionName: '' } }],
      });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.condition.update.mock.calls[0][0];
    expect(updateCall.data.optionName).toBeNull();
  });
});
