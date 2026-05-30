import { Request, Response, Router } from 'express';
import prisma from '../core/db';
import { createLogger } from '../core/logger';

const log = createLogger('routes.conditionGroups');

/** Convert BigInt values to numbers so JSON.stringify doesn't throw. */
function toJsonSafe<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    )
  ) as T;
}

function normalizeNegRiskMarketId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const router = Router();

// GET /admin/conditionGroups - list all groups with their conditions
router.get('/', async (_req: Request, res: Response) => {
  try {
    const groups = await prisma.conditionGroup.findMany({
      include: {
        category: true,
        condition: {
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(toJsonSafe(groups));
  } catch (error: unknown) {
    log.error({ err: error }, 'Error fetching condition groups:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /admin/conditionGroups - create a group
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, categoryId, categorySlug, similarMarkets, negRiskMarketId } =
      req.body as {
        name?: string;
        categoryId?: number;
        categorySlug?: string;
        similarMarkets?: string[];
        negRiskMarketId?: string | null;
      };

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    if (typeof categoryId !== 'number' && !categorySlug) {
      return res
        .status(400)
        .json({ message: 'Either categoryId or categorySlug is required' });
    }

    const normalizedNegRiskMarketId = normalizeNegRiskMarketId(negRiskMarketId);

    let resolvedCategoryId: number;
    if (typeof categoryId === 'number') {
      resolvedCategoryId = categoryId;
    } else {
      const category = await prisma.category.findFirst({
        where: { slug: categorySlug },
      });
      if (!category) {
        return res
          .status(404)
          .json({ message: `Category with slug ${categorySlug} not found` });
      }
      resolvedCategoryId = category.id;
    }

    try {
      const group = await prisma.conditionGroup.create({
        data: {
          name: name.trim(),
          categoryId: resolvedCategoryId,
          ...(Array.isArray(similarMarkets) ? { similarMarkets } : {}),
          negRiskMarketId: normalizedNegRiskMarketId,
        },
        include: { category: true, condition: true },
      });
      return res.status(201).json(toJsonSafe(group));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes('Unique constraint failed') ||
        message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          message: 'A condition group with this name already exists',
        });
      }
      log.error({ err: e }, 'Error creating condition group:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in create condition group:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditionGroups/:id - update group (name, categoryId, basket id)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const { name, categoryId, categorySlug, similarMarkets, negRiskMarketId } =
      req.body as {
        name?: string;
        categoryId?: number | null;
        categorySlug?: string | null;
        similarMarkets?: string[];
        negRiskMarketId?: string | null;
      };

    const existing = await prisma.conditionGroup.findUnique({
      where: { id: groupId },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Condition group not found' });
    }

    let resolvedCategoryId: number | null | undefined = undefined;
    if (categoryId === null || categorySlug === null) {
      // Explicitly clear category
      resolvedCategoryId = null;
    } else if (typeof categoryId === 'number') {
      resolvedCategoryId = categoryId;
    } else if (categorySlug) {
      const category = await prisma.category.findFirst({
        where: { slug: categorySlug },
      });
      if (!category) {
        return res
          .status(404)
          .json({ message: `Category with slug ${categorySlug} not found` });
      }
      resolvedCategoryId = category.id;
    }

    // negRiskMarketId touched only when the key is present in the body.
    // `null` (or empty string) explicitly clears the basket; a non-empty
    // string sets it. Absence leaves the existing value alone.
    const negRiskMarketIdTouched = Object.prototype.hasOwnProperty.call(
      req.body ?? {},
      'negRiskMarketId'
    );
    const nextNegRiskMarketId = negRiskMarketIdTouched
      ? normalizeNegRiskMarketId(negRiskMarketId)
      : undefined;

    try {
      const group = await prisma.conditionGroup.update({
        where: { id: groupId },
        data: {
          ...(typeof name !== 'undefined' && name.trim()
            ? { name: name.trim() }
            : {}),
          ...(resolvedCategoryId !== undefined
            ? { categoryId: resolvedCategoryId }
            : {}),
          ...(Array.isArray(similarMarkets) ? { similarMarkets } : {}),
          ...(negRiskMarketIdTouched
            ? { negRiskMarketId: nextNegRiskMarketId }
            : {}),
        },
        include: {
          category: true,
          condition: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      return res.json(toJsonSafe(group));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes('Unique constraint failed') ||
        message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          message: 'A condition group with this name already exists',
        });
      }
      log.error({ err: e }, 'Error updating condition group:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in update condition group:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditionGroups/:id/conditions - set conditions for a group with display order
router.put('/:id/conditions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const { conditionIds } = req.body as {
      conditionIds?: string[];
    };

    if (!Array.isArray(conditionIds)) {
      return res.status(400).json({ message: 'conditionIds must be an array' });
    }

    const existing = await prisma.conditionGroup.findUnique({
      where: { id: groupId },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Condition group not found' });
    }

    // Validate all condition IDs exist and load their current basket
    // affiliation. A condition's effective basket is the negRiskMarketId
    // of its current group (or null when unattached). Reuse this on the
    // basket check below so we don't round-trip twice.
    const validConditions = await prisma.condition.findMany({
      where: { id: { in: conditionIds } },
      select: {
        id: true,
        conditionGroup: { select: { negRiskMarketId: true } },
      },
    });
    const validIds = new Set(validConditions.map((c) => c.id));
    const invalidIds = conditionIds.filter((cid) => !validIds.has(cid));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `Invalid condition IDs: ${invalidIds.join(', ')}`,
      });
    }

    // Basket invariant: attaching a condition to a group is only legal
    // when the condition's current basket matches the target group's
    // basket exactly (null included). Without this, an unrelated market
    // can drift into a mutually-exclusive negRisk basket and corrupt
    // settlement. Conditions already in the target group trivially
    // agree (the current group IS the target group).
    const targetBasket = existing.negRiskMarketId;
    const mismatched = validConditions.filter((c) => {
      const currentBasket = c.conditionGroup?.negRiskMarketId ?? null;
      return currentBasket !== targetBasket;
    });
    if (mismatched.length > 0) {
      return res.status(400).json({
        message:
          `Cannot attach conditions to group ${groupId} ` +
          `(expected negRiskMarketId ${targetBasket ?? 'null'}): ` +
          mismatched
            .map(
              (c) => `${c.id}=${c.conditionGroup?.negRiskMarketId ?? 'null'}`
            )
            .join(', '),
      });
    }

    try {
      // Clear existing conditions from this group
      await prisma.condition.updateMany({
        where: { conditionGroupId: groupId },
        data: { conditionGroupId: null, displayOrder: null },
      });

      // Assign new conditions with display order
      for (let i = 0; i < conditionIds.length; i++) {
        await prisma.condition.update({
          where: { id: conditionIds[i] },
          data: {
            conditionGroupId: groupId,
            displayOrder: i,
          },
        });
      }

      // Fetch and return updated group
      const group = await prisma.conditionGroup.findUnique({
        where: { id: groupId },
        include: {
          category: true,
          condition: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      return res.json(toJsonSafe(group));
    } catch (e: unknown) {
      log.error({ err: e }, 'Error updating condition group conditions:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in update condition group conditions:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE /admin/conditionGroups/:id - delete a group (unlinks conditions, doesn't delete them)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const existing = await prisma.conditionGroup.findUnique({
      where: { id: groupId },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Condition group not found' });
    }

    try {
      // Clear conditions from this group first (due to foreign key)
      await prisma.condition.updateMany({
        where: { conditionGroupId: groupId },
        data: { conditionGroupId: null, displayOrder: null },
      });

      // Delete the group
      await prisma.conditionGroup.delete({
        where: { id: groupId },
      });

      return res.status(204).send();
    } catch (e: unknown) {
      log.error({ err: e }, 'Error deleting condition group:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in delete condition group:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };
