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
    it('stores negRisk metadata when creating a group', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 9,
        slug: 'sports',
      });
      mockPrisma.conditionGroup.create.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRisk: true,
        negRiskMarketId: '12345',
      });

      const res = await request(app).post('/admin/conditionGroups').send({
        name: 'NBA winner',
        categorySlug: 'sports',
        negRisk: true,
        negRiskMarketId: '12345',
      });

      expect(res.status).toBe(201);
      expect(mockPrisma.conditionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negRisk: true,
            negRiskMarketId: '12345',
          }),
        })
      );
    });

    it('rejects negRisk groups without a negRiskMarketId', async () => {
      const res = await request(app).post('/admin/conditionGroups').send({
        name: 'Broken basket',
        categoryId: 1,
        negRisk: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negRiskMarketId/i);
      expect(mockPrisma.conditionGroup.create).not.toHaveBeenCalled();
    });
  });

  describe('PUT /admin/conditionGroups/:id', () => {
    it('updates negRisk metadata and clears basket id when explicitly disabled', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRisk: true,
        negRiskMarketId: '12345',
      });
      mockPrisma.conditionGroup.update.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRisk: false,
        negRiskMarketId: null,
      });

      const res = await request(app)
        .put('/admin/conditionGroups/42')
        .send({ negRisk: false });

      expect(res.status).toBe(200);
      expect(mockPrisma.conditionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negRisk: false,
            negRiskMarketId: null,
          }),
        })
      );
    });
  });

  describe('PUT /admin/conditionGroups/:id/conditions', () => {
    it('rejects adding a condition from a different negRisk basket to a negRisk group', async () => {
      mockPrisma.conditionGroup.findUnique.mockResolvedValue({
        id: 42,
        name: 'NBA winner',
        negRisk: true,
        negRiskMarketId: 'basket-a',
      });
      mockPrisma.condition.findMany.mockResolvedValue([
        { id: HASH_A, negRisk: true, negRiskMarketId: 'basket-a' },
        { id: HASH_B, negRisk: true, negRiskMarketId: 'basket-b' },
      ]);

      const res = await request(app)
        .put('/admin/conditionGroups/42/conditions')
        .send({ conditionIds: [HASH_A, HASH_B] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negRisk/i);
      expect(mockPrisma.condition.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    });

    it('allows same-basket conditions in a negRisk group', async () => {
      mockPrisma.conditionGroup.findUnique
        .mockResolvedValueOnce({
          id: 42,
          name: 'NBA winner',
          negRisk: true,
          negRiskMarketId: 'basket-a',
        })
        .mockResolvedValueOnce({ id: 42, condition: [] });
      mockPrisma.condition.findMany.mockResolvedValue([
        { id: HASH_A, negRisk: true, negRiskMarketId: 'basket-a' },
        { id: HASH_B, negRisk: true, negRiskMarketId: 'basket-a' },
      ]);
      mockPrisma.condition.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.condition.update.mockResolvedValue({});

      const res = await request(app)
        .put('/admin/conditionGroups/42/conditions')
        .send({ conditionIds: [HASH_A, HASH_B] });

      expect(res.status).toBe(200);
      expect(mockPrisma.condition.updateMany).toHaveBeenCalled();
      expect(mockPrisma.condition.update).toHaveBeenCalledTimes(2);
    });
  });
});
