import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = {
  condition: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  category: { findFirst: vi.fn() },
  conditionGroup: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('../core/db', () => ({ default: mockPrisma, __esModule: true }));

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
    mockPrisma.condition.findMany.mockResolvedValue([]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
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

    it('stores tags array when provided (first-letter capitalized)', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ tags: ['bitcoin', 'crypto', 'UFC'] }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.tags).toEqual(['Bitcoin', 'Crypto', 'UFC']);
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

    it('stores negRisk metadata when provided', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ negRisk: true, negRiskMarketId: 'basket-a' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.negRisk).toBe(true);
      expect(createCall.data.negRiskMarketId).toBe('basket-a');
    });

    it('rejects negRisk conditions without a negRiskMarketId', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ negRisk: true }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negRiskMarketId/i);
      expect(mockPrisma.condition.create).not.toHaveBeenCalled();
    });

    it('rejects negRisk conditions without a negRiskMarketId before creating a group', async () => {
      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ groupName: 'NBA champion', negRisk: true }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negRiskMarketId/i);
      expect(mockPrisma.conditionGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.condition.create).not.toHaveBeenCalled();
    });

    it('stores similarMarketVolume when provided', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ similarMarketVolume: 123456.78 }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.similarMarketVolume).toBe(123456.78);
    });

    it('stores similarMarketImage when provided', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(
          baseBody({
            similarMarketImage:
              'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg',
          })
        );

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.similarMarketImage).toBe(
        'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg'
      );
    });

    it('ignores similarMarketImage when not a valid URL', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ similarMarketImage: 'not-a-url' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.similarMarketImage).toBeUndefined();
    });

    it('persists trimmed optionName on create', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ optionName: '  April 7  ' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBe('April 7');
    });

    it('leaves optionName undefined when omitted', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app).post('/admin/conditions').send(baseBody());

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBeUndefined();
    });

    it('leaves optionName undefined when only whitespace', async () => {
      mockPrisma.condition.create.mockResolvedValue({ id: '0x1' });

      const res = await request(app)
        .post('/admin/conditions')
        .send(baseBody({ optionName: '   ' }));

      expect(res.status).toBe(201);
      const createCall = mockPrisma.condition.create.mock.calls[0][0];
      expect(createCall.data.optionName).toBeUndefined();
    });
  });

  // ---------- POST /admin/conditions/batch-create ----------

  describe('POST /admin/conditions/batch-create', () => {
    it('persists optionName for every item in the batch', async () => {
      mockPrisma.condition.create.mockResolvedValue({});
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.conditionGroup.findFirst.mockResolvedValue(null);

      const items = [
        {
          conditionHash: '0x' + '11'.repeat(32),
          question: 'Will BTC reach $150k in April?',
          shortName: 'BTC ≥$150k Apr',
          optionName: '↑ 150,000',
          endTime: FUTURE_END_TIME,
          description: 'test',
          resolver: VALID_RESOLVER,
        },
        {
          conditionHash: '0x' + '22'.repeat(32),
          question: 'Will BTC dip to $60k in April?',
          shortName: 'BTC ≤$60k Apr',
          optionName: '↓ 60,000',
          endTime: FUTURE_END_TIME,
          description: 'test',
          resolver: VALID_RESOLVER,
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

    it('passes similarMarketVolume to Prisma when provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([{ count: 1 }]);

      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [
            {
              id: VALID_CONDITION_HASH,
              estimatedPrice: 0.5,
              similarMarketVolume: 99999.99,
            },
          ],
        });

      expect(res.status).toBe(200);
      const updateManyCall = mockPrisma.condition.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.similarMarketVolume).toBe(99999.99);
    });

    it('passes similarMarketImage to Prisma when provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([{ count: 1 }]);

      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [
            {
              id: VALID_CONDITION_HASH,
              estimatedPrice: 0.5,
              similarMarketImage:
                'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg',
            },
          ],
        });

      expect(res.status).toBe(200);
      const updateManyCall = mockPrisma.condition.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.similarMarketImage).toBe(
        'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg'
      );
    });

    it('works without similarMarketVolume (backward compat)', async () => {
      mockPrisma.$transaction.mockResolvedValue([{ count: 1 }]);

      const res = await request(app)
        .put('/admin/conditions/prices')
        .send({
          updates: [{ id: VALID_CONDITION_HASH, estimatedPrice: 0.5 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);
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

    it('updates tags when provided (first-letter capitalized)', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());
      mockPrisma.condition.update.mockResolvedValue({
        ...existingCondition(),
        tags: ['Updated-tag'],
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ tags: ['updated-tag'] });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.tags).toEqual(['Updated-tag']);
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

    it('updates similarMarketVolume when provided', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());
      mockPrisma.condition.update.mockResolvedValue({
        ...existingCondition(),
        similarMarketVolume: 50000,
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ similarMarketVolume: 50000 });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.similarMarketVolume).toBe(50000);
    });

    it('updates similarMarketImage when provided', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());
      mockPrisma.condition.update.mockResolvedValue({
        ...existingCondition(),
        similarMarketImage:
          'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg',
      });

      const res = await request(app).put(`/admin/conditions/${VALID_ID}`).send({
        similarMarketImage:
          'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg',
      });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.similarMarketImage).toBe(
        'https://polymarket-upload.s3.us-east-2.amazonaws.com/test.jpg'
      );
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

    it('updates optionName when provided', async () => {
      const existing = existingCondition({ optionName: null });
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue({
        ...existing,
        optionName: 'April 7',
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ optionName: 'April 7' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.optionName).toBe('April 7');
    });

    it('clears optionName when empty string is provided', async () => {
      const existing = existingCondition({ optionName: 'April 7' });
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue({
        ...existing,
        optionName: null,
      });

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ optionName: '' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.optionName).toBeNull();
    });

    it('leaves optionName untouched when not in body', async () => {
      const existing = existingCondition({ optionName: 'April 7' });
      mockPrisma.condition.findUnique.mockResolvedValue(existing);
      mockPrisma.condition.update.mockResolvedValue(existing);

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ question: 'new question' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.optionName).toBeUndefined();
    });

    it('rejects negRisk updates without a negRiskMarketId before creating a group', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(existingCondition());

      const res = await request(app)
        .put(`/admin/conditions/${VALID_ID}`)
        .send({ groupName: 'NBA champion', negRisk: true });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negRiskMarketId/i);
      expect(mockPrisma.conditionGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    });
  });

  // ---------- PUT /admin/conditions/batch-metadata ----------

  describe('PUT /admin/conditions/batch-metadata', () => {
    const VALID_ID = '0x' + 'cd'.repeat(32);

    it('updates optionName when present in fields', async () => {
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [{ id: VALID_ID, fields: { optionName: 'Viktor Orban' } }],
        });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.optionName).toBe('Viktor Orban');
    });

    it('clears optionName with empty string', async () => {
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [{ id: VALID_ID, fields: { optionName: '' } }],
        });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.optionName).toBeNull();
    });

    it('persists negRisk metadata when present in fields', async () => {
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [
            {
              id: VALID_ID,
              fields: { negRisk: true, negRiskMarketId: 'basket-123' },
            },
          ],
        });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.negRisk).toBe(true);
      expect(updateCall.data.negRiskMarketId).toBe('basket-123');
    });

    it('clears negRiskMarketId when negRisk is false', async () => {
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [
            {
              id: VALID_ID,
              fields: { negRisk: false, negRiskMarketId: 'stale-basket' },
            },
          ],
        });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.negRisk).toBe(false);
      expect(updateCall.data.negRiskMarketId).toBeNull();
    });

    it('rejects assigning batch metadata to an existing negRisk group with a mismatched basket', async () => {
      mockPrisma.conditionGroup.findMany.mockResolvedValue([
        {
          id: 42,
          name: 'NBA champion',
          negRisk: true,
          negRiskMarketId: 'basket-a',
        },
      ]);

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [
            {
              id: VALID_ID,
              fields: {
                groupName: 'NBA champion',
                negRisk: true,
                negRiskMarketId: 'basket-b',
              },
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-matching condition/i);
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    });

    it('allows assigning batch metadata to an existing negRisk group with the matching basket', async () => {
      mockPrisma.conditionGroup.findMany.mockResolvedValue([
        {
          id: 42,
          name: 'NBA champion',
          negRisk: true,
          negRiskMarketId: 'basket-a',
        },
      ]);
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditions/batch-metadata')
        .send({
          updates: [
            {
              id: VALID_ID,
              fields: {
                groupName: 'NBA champion',
                negRisk: true,
                negRiskMarketId: 'basket-a',
              },
            },
          ],
        });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.condition.update.mock.calls[0][0];
      expect(updateCall.data.conditionGroupId).toBe(42);
      expect(updateCall.data.negRisk).toBe(true);
      expect(updateCall.data.negRiskMarketId).toBe('basket-a');
    });
  });
});
