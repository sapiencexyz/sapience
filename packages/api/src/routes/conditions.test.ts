import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = {
  condition: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  category: { findFirst: vi.fn() },
  conditionGroup: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('../db', () => ({ default: mockPrisma, __esModule: true }));

const app = express();
app.use(express.json());
const { router } = await import('./conditions');
app.use('/admin/conditions', router);

const VALID_CONDITION_HASH = '0x' + 'ab'.repeat(32);
const VALID_RESOLVER = '0x' + 'cd'.repeat(20);
const FUTURE_END_TIME = Math.floor(Date.now() / 1000) + 86400;
const PAST_END_TIME = 1000;

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    conditionHash: VALID_CONDITION_HASH,
    question: 'Will BTC hit 100k?',
    endTime: FUTURE_END_TIME,
    description: 'A test condition',
    resolver: VALID_RESOLVER,
    ...overrides,
  };
}

describe('conditions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- POST /admin/conditions ----------

  describe('POST /admin/conditions', () => {
    it('returns 400 when question is missing', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ question: undefined }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/question/i);
    });

    it('returns 400 when endTime is missing', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ endTime: undefined }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/endTime/i);
    });

    it('returns 400 when endTime is in the past', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ endTime: PAST_END_TIME }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/future/i);
    });

    it('returns 400 when similarMarkets contains non-URL strings', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ similarMarkets: ['not-a-url'] }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/similarMarkets/);
    });

    it('returns 404 when categorySlug is not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ categorySlug: 'nonexistent' }));

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/nonexistent/);
    });

    it('returns 400 when conditionHash is missing', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ conditionHash: undefined }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/conditionHash/i);
    });

    it('uses provided conditionHash directly and returns 201', async () => {
      const created = { id: VALID_CONDITION_HASH };
      mockPrisma.condition.create.mockResolvedValue(created);

      const res = await request(app).post('/admin/conditions').send(baseBody());

      expect(res.status).toBe(201);

      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.id).toBe(VALID_CONDITION_HASH);
    });

    it('defaults chainId to 42161', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      await request(app).post('/admin/conditions').send(baseBody());

      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.chainId).toBe(42161);
    });

    it('returns 409 on duplicate condition (Unique constraint)', async () => {
      mockPrisma.condition.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`id`)')
      );

      const res = await request(app).post('/admin/conditions').send(baseBody());

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('stores tags array when provided', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ tags: ['bitcoin', 'crypto'] }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.tags).toEqual(['bitcoin', 'crypto']);
    });

    it('defaults tags to empty array when not provided', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app).post('/admin/conditions').send(baseBody());

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.tags).toEqual([]);
    });

    it('returns 400 when tags is not an array', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ tags: 'not-an-array' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/tags/);
    });

    it('returns 400 when tags contains non-strings', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ tags: [123, null] }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/tags/);
    });

    it('creates conditionGroup when groupName is provided and returns 201', async () => {
      mockPrisma.conditionGroup.findFirst.mockResolvedValue(null);
      mockPrisma.conditionGroup.create.mockResolvedValue({
        id: 42,
        name: 'My Group',
      });
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ groupName: 'My Group' }));

      expect(res.status).toBe(201);
      expect(mockPrisma.conditionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'My Group' }),
        })
      );
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.conditionGroupId).toBe(42);
    });
  });

  // ---------- PUT /admin/conditions/prices ----------

  describe('PUT /admin/conditions/prices', () => {
    it('returns 400 when updates is missing', async () => {
      const res = await request(app).put('/admin/conditions/prices').send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/updates/);
    });

    it('returns 400 when updates is empty', async () => {
      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({ updates: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/updates/);
    });

    it('returns 400 when id format is invalid', async () => {
      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({ updates: [{ id: 'bad-id', estimatedPrice: 0.5 }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid id format/);
    });

    it('returns 400 when estimatedPrice is out of range', async () => {
      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [{ id: VALID_CONDITION_HASH, estimatedPrice: 1.5 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/estimatedPrice/);
    });

    it('returns 400 when estimatedPrice is negative', async () => {
      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [{ id: VALID_CONDITION_HASH, estimatedPrice: -0.1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/estimatedPrice/);
    });

    it('returns 400 when batch exceeds 200 updates', async () => {
      const updates = Array.from({ length: 201 }, (_, i) => ({
        id: '0x' + i.toString(16).padStart(64, '0'),
        estimatedPrice: 0.5,
      }));

      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({ updates });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/200/);
    });

    it('updates prices successfully and returns 200', async () => {
      mockPrisma.$transaction.mockResolvedValue([{ count: 1 }, { count: 1 }]);

      const HASH2 = '0x' + 'cd'.repeat(32);
      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [
            { id: VALID_CONDITION_HASH, estimatedPrice: 0.65 },
            { id: HASH2, estimatedPrice: 0.35 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);
      expect(res.body.requested).toBe(2);
    });

    it('accepts boundary values 0 and 1', async () => {
      const HASH2 = '0x' + 'cd'.repeat(32);
      mockPrisma.$transaction.mockResolvedValue([{ count: 1 }, { count: 1 }]);

      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [
            { id: VALID_CONDITION_HASH, estimatedPrice: 0 },
            { id: HASH2, estimatedPrice: 1 },
          ],
        });

      expect(res.status).toBe(200);
    });
  });

  // ---------- PUT /admin/conditions/:id ----------

  describe('PUT /admin/conditions/:id', () => {
    const VALID_ID = '0x' + 'aa'.repeat(32);

    function existingCondition(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_ID,
        question: 'Original question',
        endTime: FUTURE_END_TIME,
        chainId: 42161,
        settled: false,
        categoryId: null,
        ...overrides,
      };
    }

    it('returns 400 for invalid ID format', async () => {
      const res = await request(app)
        .put('/admin/conditions/bad-id')
        .send({ question: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid id format/);
    });

    it('returns 404 when condition is not found', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ question: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('allows shortening endTime on unsettled condition', async () => {
      const existing = existingCondition({ endTime: FUTURE_END_TIME + 5000 });
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue({
        ...existing,
        endTime: FUTURE_END_TIME,
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ endTime: FUTURE_END_TIME });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.endTime).toBe(FUTURE_END_TIME);
    });

    it('returns 400 when changing endTime on settled condition', async () => {
      const existing = existingCondition({ settled: true });
      mockPrisma.condition.findUnique.mockResolvedValue(existing);

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ endTime: FUTURE_END_TIME + 10000 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/settled/i);
    });

    it('allows forward endTime extension and returns 200', async () => {
      const existing = existingCondition();
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue({
        ...existing,
        endTime: FUTURE_END_TIME + 10000,
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ endTime: FUTURE_END_TIME + 10000 });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.endTime).toBe(FUTURE_END_TIME + 10000);
    });

    it('updates tags when provided', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());
      mockPrisma.condition.update.mockResolvedValue({
        ...existingCondition(),
        tags: ['updated-tag'],
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ tags: ['updated-tag'] });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.tags).toEqual(['updated-tag']);
    });

    it('does not overwrite tags when not provided', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());
      mockPrisma.condition.update.mockResolvedValue({
        ...existingCondition(),
        question: 'Updated question',
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ question: 'Updated question' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('tags');
    });

    it('updates question and description fields and returns 200', async () => {
      const existing = existingCondition();
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue({
        ...existing,
        question: 'New question',
        description: 'New description',
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ question: 'New question', description: 'New description' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.question).toBe('New question');
      expect(updateCall.data.description).toBe('New description');
    });
  });
});
