import { Request, Response, Router } from 'express';
import prisma from '../db';

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
    return res.json(groups);
  } catch (error: unknown) {
    console.error('Error fetching condition groups:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /admin/conditionGroups - create a group
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, categoryId, categorySlug } = req.body as {
      name?: string;
      categoryId?: number;
      categorySlug?: string;
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    if (typeof categoryId !== 'number' && !categorySlug) {
      return res
        .status(400)
        .json({ message: 'Either categoryId or categorySlug is required' });
    }

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
        },
        include: { category: true, condition: true },
      });
      return res.status(201).json(group);
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
      console.error('Error creating condition group:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in create condition group:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditionGroups/:id - update group (name, categoryId)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const groupId = parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const { name, categoryId, categorySlug } = req.body as {
      name?: string;
      categoryId?: number | null;
      categorySlug?: string | null;
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
        },
        include: {
          category: true,
          condition: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      return res.json(group);
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
      console.error('Error updating condition group:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in update condition group:', error);
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

    // Validate all condition IDs exist
    const validConditions = await prisma.condition.findMany({
      where: { id: { in: conditionIds } },
      select: { id: true },
    });
    const validIds = new Set(validConditions.map((c) => c.id));
    const invalidIds = conditionIds.filter((cid) => !validIds.has(cid));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `Invalid condition IDs: ${invalidIds.join(', ')}`,
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
      return res.json(group);
    } catch (e: unknown) {
      console.error('Error updating condition group conditions:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in update condition group conditions:', error);
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
      console.error('Error deleting condition group:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in delete condition group:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };

