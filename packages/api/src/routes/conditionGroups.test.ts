import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = {
  category: { findFirst: vi.fn() },
  conditionGroup: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  condition: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../core/db', () => ({ default: mockPrisma, __esModule: true }));

const app = express();
app.use(express.json());
const { router } = await import('./conditionGroups');
app.use('/admin/conditionGroups', router);

const HASH_A = '0x' + 'aa'.repeat(32);
const HASH_B = '0x' + 'bb'.repeat(32);

describe('conditionGroups routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /admin/conditionGroups', () => {
    it('stores negRiskMarketId when creating a group', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 9,
        slug: 'sports',
      });
      mockPrisma.conditionGroup.create.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: '12345',
      });

      const res = await request(app).post('/admin/conditionGroups').send({
        name: 'NBA winner',
        categorySlug: 'sports',
        negRiskMarketId: '12345',
      });

      expect(res.status).toBe(201);
      expect(mockPrisma.conditionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negRiskMarketId: '12345',
          }),
        })
      );
    });

    it('creates a non-basket group when negRiskMarketId is omitted', async () => {
      mockPrisma.conditionGroup.create.mockResolvedValue({
        id: 43,
        name: 'Mixed group',
        negRiskMarketId: null,
      });

      const res = await request(app).post('/admin/conditionGroups').send({
        name: 'Mixed group',
        categoryId: 1,
      });

      expect(res.status).toBe(201);
      expect(mockPrisma.conditionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ negRiskMarketId: null }),
        })
      );
    });
  });

  describe('PUT /admin/conditionGroups/:id', () => {
    it('clears negRiskMarketId when explicitly passed null', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: '12345',
      });
      mockPrisma.conditionGroup.update.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: null,
      });

      const res = await request(app)
        .put('/admin/conditionGroups/42')
        .send({ negRiskMarketId: null });

      expect(res.status).toBe(200);
      expect(mockPrisma.conditionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ negRiskMarketId: null }),
        })
      );
    });

    it('clears negRiskMarketId when explicitly passed an empty string', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: '12345',
      });
      mockPrisma.conditionGroup.update.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: null,
      });

      const res = await request(app)
        .put('/admin/conditionGroups/42')
        .send({ negRiskMarketId: '   ' });

      expect(res.status).toBe(200);
      expect(mockPrisma.conditionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ negRiskMarketId: null }),
        })
      );
    });

    it('sets negRiskMarketId when promoting a group to a basket', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: null,
      });
      mockPrisma.conditionGroup.update.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: 'basket-a',
      });

      const res = await request(app)
        .put('/admin/conditionGroups/42')
        .send({ negRiskMarketId: 'basket-a' });

      expect(res.status).toBe(200);
      expect(mockPrisma.conditionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ negRiskMarketId: 'basket-a' }),
        })
      );
    });

    it('leaves negRiskMarketId untouched when not present in body', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: 'basket-a',
      });
      mockPrisma.conditionGroup.update.mockResolvedValue({
        id: 42,
        name: 'Renamed',
        negRiskMarketId: 'basket-a',
      });

      const res = await request(app)
        .put('/admin/conditionGroups/42')
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      const updateCall = mockPrisma.conditionGroup.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('negRiskMarketId');
    });
  });

  describe('PUT /admin/conditionGroups/:id/conditions', () => {
    it('assigns conditions to a group without inspecting per-condition basket fields', async () => {
      mockPrisma.conditionGroup.findUnique
        .mockResolvedValueOnce({
          id: 42,
          name: 'NBA winner',
          negRiskMarketId: 'basket-a',
        })
        .mockResolvedValueOnce({ id: 42, condition: [] });
      mockPrisma.condition.findMany.mockResolvedValue([
        { id: HASH_A },
        { id: HASH_B },
      ]);
      mockPrisma.condition.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditionGroups/42/conditions')
        .send({ conditionIds: [HASH_A, HASH_B] });

      expect(res.status).toBe(200);
      expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true } })
      );
      expect(mockPrisma.condition.update).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid condition ids with a 400', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRiskMarketId: 'basket-a',
      });
      mockPrisma.condition.findMany.mockResolvedValue([{ id: HASH_A }]);

      const res = await request(app)
        .put('/admin/conditionGroups/42/conditions')
        .send({ conditionIds: [HASH_A, HASH_B] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid condition IDs/);
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    });
  });
});
