import { Request, Response, Router } from 'express';
import prisma from '../db';

const router = Router();

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET route removed in favor of GraphQL. Use GraphQL `conditions` query for reads.

// POST /admin/conditions - create a condition
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      conditionHash,
      question,
      shortName,
      categoryId,
      categorySlug,
      endTime,
      public: isPublic = true,
      description,
      similarMarkets,
      chainId,
      groupName,
      resolver,
      tags,
    } = req.body as {
      conditionHash?: string;
      question?: string;
      shortName?: string;
      categoryId?: number;
      categorySlug?: string;
      endTime?: number | string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      chainId?: number;
      groupName?: string;
      resolver?: string;
      tags?: string[];
    };

    // conditionHash is required (must be 0x-prefixed 32-byte hex)
    if (!conditionHash || !/^0x[0-9a-fA-F]{64}$/.test(conditionHash)) {
      return res.status(400).json({
        message:
          'conditionHash is required and must be a 0x-prefixed 32-byte hex string',
      });
    }

    if (!question || !endTime || !description) {
      return res.status(400).json({
        message: `Missing required fields: ${!question ? 'question' : ''}${!endTime ? ' endTime ' : ''}${!description ? ' description' : ''}`,
      });
    }

    // Validate resolver if provided
    if (resolver) {
      if (
        typeof resolver !== 'string' ||
        !/^0x[a-fA-F0-9]{40}$/.test(resolver)
      ) {
        return res.status(400).json({
          message: 'Resolver must be a valid Ethereum address (0x...)',
        });
      }
    }

    let resolvedCategoryId: number | null = null;
    if (typeof categoryId === 'number') {
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

    // Find or create condition group if groupName is provided
    let resolvedGroupId: number | null = null;
    if (groupName && groupName.trim()) {
      let group = await prisma.conditionGroup.findFirst({
        where: { name: groupName.trim() },
      });
      if (!group) {
        // Create with inherited category (smart default)
        group = await prisma.conditionGroup.create({
          data: {
            name: groupName.trim(),
            categoryId: resolvedCategoryId ?? undefined,
          },
        });
      }
      resolvedGroupId = group.id;
    }

    const endTimeInt = parseInt(String(endTime), 10);
    if (Number.isNaN(endTimeInt)) {
      return res.status(400).json({ message: 'Invalid endTime' });
    }

    // Enforce endTime is in the future (Unix seconds)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (endTimeInt <= nowSeconds) {
      return res.status(400).json({
        message: `endTime must be a future Unix timestamp (seconds), endTime: ${endTimeInt}, nowSeconds: ${nowSeconds}`,
      });
    }

    // Validate similarMarkets URLs if provided
    if (
      typeof similarMarkets !== 'undefined' &&
      (!Array.isArray(similarMarkets) ||
        !similarMarkets.every((s) => typeof s === 'string' && isHttpUrl(s)))
    ) {
      return res
        .status(400)
        .json({ message: 'similarMarkets must be HTTP(S) URLs' });
    }

    // Validate tags if provided
    if (
      typeof tags !== 'undefined' &&
      (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
    ) {
      return res
        .status(400)
        .json({ message: 'tags must be an array of strings' });
    }

    const id = conditionHash;

    try {
      const condition = await prisma.condition.create({
        data: {
          id,
          question,
          shortName:
            shortName && shortName.trim().length > 0
              ? shortName.trim()
              : undefined,
          categoryId: resolvedCategoryId ?? undefined,
          endTime: endTimeInt,
          public: Boolean(isPublic),
          description,
          similarMarkets: Array.isArray(similarMarkets) ? similarMarkets : [],
          tags: Array.isArray(tags) ? tags : [],
          chainId: chainId ?? 42161, // Default to Arbitrum if not provided
          conditionGroupId: resolvedGroupId ?? undefined,
          displayOrder: resolvedGroupId ? 0 : undefined,
          resolver: resolver ? resolver.toLowerCase() : undefined,
        },
        include: { category: true, conditionGroup: true },
      });
      return res.status(201).json(condition);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes('Unique constraint failed') ||
        message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          message: 'Condition already exists',
        });
      }
      console.error('Error creating condition:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in create condition:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/batch - batch update fields on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching "batch" as an :id param
router.put('/batch', async (req: Request, res: Response) => {
  try {
    const { ids, update } = req.body as {
      ids?: string[];
      update?: { public?: boolean };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: 'ids must be a non-empty array of condition IDs' });
    }

    if (ids.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 conditions' });
    }

    if (!update || typeof update !== 'object') {
      return res.status(400).json({ message: 'update object is required' });
    }

    // Validate all IDs are valid hex
    for (const id of ids) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
        return res.status(400).json({ message: `Invalid id format: ${id}` });
      }
    }

    // Build update data
    const data: Record<string, unknown> = {};

    if (typeof update.public !== 'undefined') {
      data.public = Boolean(update.public);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const existing = await prisma.condition.count({
      where: { id: { in: ids } },
    });

    if (existing === 0) {
      return res
        .status(404)
        .json({ message: 'No conditions found matching the provided IDs' });
    }

    const result = await prisma.condition.updateMany({
      where: { id: { in: ids } },
      data,
    });

    const status = existing < ids.length ? 207 : 200;
    return res.status(status).json({
      updated: result.count,
      requested: ids.length,
      found: existing,
    });
  } catch (error: unknown) {
    console.error('Error in batch update conditions:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/:id - update editable fields
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate 0x-prefixed 32-byte hex string
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const {
      question,
      shortName,
      categoryId,
      categorySlug,
      public: isPublic,
      description,
      similarMarkets,
      endTime,
      chainId,
      groupName,
      tags,
    } = req.body as {
      question?: string;
      shortName?: string;
      categoryId?: number;
      categorySlug?: string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      endTime?: number | string;
      chainId?: number;
      groupName?: string;
      tags?: string[];
    };

    const existing = await prisma.condition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Condition not found' });
    }

    let newEndTime: number | undefined;
    if (typeof endTime !== 'undefined') {
      const endTimeInt = parseInt(String(endTime), 10);
      if (Number.isNaN(endTimeInt)) {
        return res.status(400).json({ message: 'Invalid endTime' });
      }
      if (endTimeInt !== existing.endTime) {
        if (existing.settled) {
          return res.status(400).json({
            message: 'endTime cannot be changed on a settled condition',
          });
        }
        newEndTime = endTimeInt;
      }
    }

    if (typeof chainId !== 'undefined' && chainId !== existing.chainId) {
      return res.status(400).json({ message: 'chainId cannot be changed' });
    }

    let resolvedCategoryId: number | null = null;
    if (typeof categoryId === 'number') {
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

    // Find or create condition group if groupName is provided
    let resolvedGroupId: number | undefined;
    if (groupName && groupName.trim()) {
      let group = await prisma.conditionGroup.findFirst({
        where: { name: groupName.trim() },
      });
      if (!group) {
        // Create with inherited category (smart default: use resolved or existing category)
        const categoryForGroup = resolvedCategoryId ?? existing.categoryId;
        group = await prisma.conditionGroup.create({
          data: {
            name: groupName.trim(),
            categoryId: categoryForGroup ?? undefined,
          },
        });
      }
      resolvedGroupId = group.id;
    }

    try {
      // Validate similarMarkets URLs if provided
      if (
        typeof similarMarkets !== 'undefined' &&
        (!Array.isArray(similarMarkets) ||
          !similarMarkets.every((s) => typeof s === 'string' && isHttpUrl(s)))
      ) {
        return res
          .status(400)
          .json({ message: 'similarMarkets must be HTTP(S) URLs' });
      }

      // Validate tags if provided
      if (
        typeof tags !== 'undefined' &&
        (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
      ) {
        return res
          .status(400)
          .json({ message: 'tags must be an array of strings' });
      }

      const condition = await prisma.condition.update({
        where: { id },
        data: {
          ...(typeof question !== 'undefined' ? { question } : {}),
          ...(typeof shortName !== 'undefined'
            ? {
                shortName:
                  shortName && shortName.trim().length > 0
                    ? shortName.trim()
                    : null,
              }
            : {}),
          ...(resolvedCategoryId !== null
            ? { categoryId: resolvedCategoryId }
            : {}),
          ...(typeof isPublic !== 'undefined'
            ? { public: Boolean(isPublic) }
            : {}),
          ...(typeof description !== 'undefined' ? { description } : {}),
          ...(typeof similarMarkets !== 'undefined'
            ? {
                similarMarkets: Array.isArray(similarMarkets)
                  ? similarMarkets
                  : [],
              }
            : {}),
          ...(typeof tags !== 'undefined'
            ? { tags: Array.isArray(tags) ? tags : [] }
            : {}),
          // Extend endTime if a new forward value was provided
          ...(newEndTime !== undefined ? { endTime: newEndTime } : {}),
          // Assign to group if groupName was provided
          ...(resolvedGroupId !== undefined
            ? { conditionGroupId: resolvedGroupId, displayOrder: 0 }
            : {}),
        },
        include: { category: true, conditionGroup: true },
      });
      return res.json(condition);
    } catch (e: unknown) {
      console.error('Error updating condition:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in update condition:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE route removed per product decision; conditions are not deletable via API

export { router };
