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

interface BatchCreateConditionInput {
  conditionHash: string;
  question: string;
  shortName?: string;
  optionName?: string;
  categorySlug?: string;
  endTime: number;
  description: string;
  similarMarkets?: string[];
  tags?: string[];
  chainId?: number;
  groupName?: string;
  resolver: string;
  estimatedPrice?: number;
  similarMarketVolume?: number;
  similarMarketImage?: string;
}

// POST /admin/conditions/batch-create - batch create conditions (with auto group creation)
// NOTE: Must be registered before /:id and the single POST / route
router.post('/batch-create', async (req: Request, res: Response) => {
  try {
    const { conditions: items } = req.body as {
      conditions?: BatchCreateConditionInput[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: 'conditions must be a non-empty array' });
    }

    // No count limit — the express.json body parser (100KB) is the effective cap.
    // The keeper uses batchBySize() to stay under the body limit dynamically.

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Validate all items upfront before touching DB
    for (const item of items) {
      if (
        !item.conditionHash ||
        !/^0x[0-9a-fA-F]{64}$/.test(item.conditionHash)
      ) {
        return res.status(400).json({
          message: `Invalid conditionHash: ${item.conditionHash}`,
        });
      }
      if (!item.question || !item.endTime || !item.description) {
        return res.status(400).json({
          message: `Missing required fields for ${item.conditionHash}`,
        });
      }
      if (!item.resolver || !/^0x[a-fA-F0-9]{40}$/.test(item.resolver)) {
        return res.status(400).json({
          message: `Invalid resolver for ${item.conditionHash}`,
        });
      }
      const endTimeInt = parseInt(String(item.endTime), 10);
      if (Number.isNaN(endTimeInt) || endTimeInt <= nowSeconds) {
        return res.status(400).json({
          message: `endTime must be a future Unix timestamp for ${item.conditionHash}`,
        });
      }
    }

    // Resolve category slugs (batch lookup)
    const uniqueSlugs = [
      ...new Set(items.map((i) => i.categorySlug).filter(Boolean)),
    ] as string[];
    const categories =
      uniqueSlugs.length > 0
        ? await prisma.category.findMany({
            where: { slug: { in: uniqueSlugs } },
          })
        : [];
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    // Resolve or create groups (batch find, then create missing)
    const uniqueGroupNames = [
      ...new Set(items.map((i) => i.groupName?.trim()).filter(Boolean)),
    ] as string[];
    const existingGroups =
      uniqueGroupNames.length > 0
        ? await prisma.conditionGroup.findMany({
            where: { name: { in: uniqueGroupNames } },
          })
        : [];
    const groupByName = new Map(existingGroups.map((g) => [g.name, g.id]));

    // Create missing groups
    const failedGroups: string[] = [];
    for (const name of uniqueGroupNames) {
      if (!groupByName.has(name)) {
        // Find categoryId from the first condition that references this group
        const firstItem = items.find((i) => i.groupName?.trim() === name);
        const categoryId = firstItem?.categorySlug
          ? (categoryBySlug.get(firstItem.categorySlug) ?? null)
          : null;
        try {
          const group = await prisma.conditionGroup.create({
            data: { name, categoryId },
          });
          groupByName.set(name, group.id);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          if (message.includes('Unique constraint')) {
            // Race condition: another request created it
            const existing = await prisma.conditionGroup.findFirst({
              where: { name },
            });
            if (existing) groupByName.set(name, existing.id);
          } else {
            console.error(
              `[BatchCreate] Failed to create group "${name}": ${message}`
            );
            failedGroups.push(name);
          }
        }
      }
    }

    // Create conditions
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      const categoryId = item.categorySlug
        ? (categoryBySlug.get(item.categorySlug) ?? null)
        : null;
      const groupId = item.groupName?.trim()
        ? (groupByName.get(item.groupName.trim()) ?? null)
        : null;

      try {
        await prisma.condition.create({
          data: {
            id: item.conditionHash,
            question: item.question,
            shortName: item.shortName?.trim() || undefined,
            optionName: item.optionName?.trim() || undefined,
            categoryId: categoryId ?? undefined,
            endTime: parseInt(String(item.endTime), 10),
            public: true,
            description: item.description,
            similarMarkets: Array.isArray(item.similarMarkets)
              ? item.similarMarkets
              : [],
            tags: Array.isArray(item.tags) ? item.tags : [],
            chainId: item.chainId ?? 42161,
            estimatedPrice:
              typeof item.estimatedPrice === 'number' &&
              item.estimatedPrice >= 0 &&
              item.estimatedPrice <= 1
                ? item.estimatedPrice
                : undefined,
            similarMarketVolume:
              typeof item.similarMarketVolume === 'number' &&
              item.similarMarketVolume >= 0
                ? item.similarMarketVolume
                : undefined,
            similarMarketImage:
              typeof item.similarMarketImage === 'string' &&
              isHttpUrl(item.similarMarketImage)
                ? item.similarMarketImage
                : undefined,
            conditionGroupId: groupId ?? undefined,
            displayOrder: groupId ? 0 : undefined,
            resolver: item.resolver.toLowerCase(),
          },
        });
        created++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('Unique constraint')) {
          skipped++;
        } else {
          console.error(
            `[BatchCreate] Failed ${item.conditionHash}: ${message}`
          );
          failed++;
        }
      }
    }

    return res.status(201).json({
      created,
      skipped,
      failed,
      ...(failedGroups.length > 0 ? { failedGroups } : {}),
    });
  } catch (error: unknown) {
    console.error('Error in batch create conditions:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /admin/conditions - create a condition
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      conditionHash,
      question,
      shortName,
      optionName,
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
      estimatedPrice,
      similarMarketVolume,
      similarMarketImage,
    } = req.body as {
      conditionHash?: string;
      question?: string;
      shortName?: string;
      optionName?: string;
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
      estimatedPrice?: number;
      similarMarketVolume?: number;
      similarMarketImage?: string;
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

    // Validate resolver — required, must be a valid Ethereum address
    if (
      !resolver ||
      typeof resolver !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(resolver)
    ) {
      return res.status(400).json({
        message:
          'resolver is required and must be a valid Ethereum address (0x-prefixed, 40 hex chars)',
      });
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
          optionName:
            optionName && optionName.trim().length > 0
              ? optionName.trim()
              : undefined,
          categoryId: resolvedCategoryId ?? undefined,
          endTime: endTimeInt,
          public: Boolean(isPublic),
          description,
          similarMarkets: Array.isArray(similarMarkets) ? similarMarkets : [],
          tags: Array.isArray(tags) ? tags : [],
          chainId: chainId ?? 42161, // Default to Arbitrum if not provided
          estimatedPrice:
            typeof estimatedPrice === 'number' &&
            estimatedPrice >= 0 &&
            estimatedPrice <= 1
              ? estimatedPrice
              : undefined,
          similarMarketVolume:
            typeof similarMarketVolume === 'number' && similarMarketVolume >= 0
              ? similarMarketVolume
              : undefined,
          similarMarketImage:
            typeof similarMarketImage === 'string' &&
            isHttpUrl(similarMarketImage)
              ? similarMarketImage
              : undefined,
          conditionGroupId: resolvedGroupId ?? undefined,
          displayOrder: resolvedGroupId ? 0 : undefined,
          resolver: resolver.toLowerCase(),
        },
        include: { category: true, conditionGroup: true },
      });
      return res
        .status(201)
        .json(
          JSON.parse(
            JSON.stringify(condition, (_k, v) =>
              typeof v === 'bigint' ? Number(v) : v
            )
          )
        );
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

// PUT /admin/conditions/prices - batch update estimatedPrice on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching "prices" as an :id param
router.put('/prices', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<{
        id: string;
        estimatedPrice: number;
        similarMarketVolume?: number;
        similarMarketImage?: string;
      }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    if (updates.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 updates' });
    }

    // Validate each update
    for (const update of updates) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(update.id)) {
        return res
          .status(400)
          .json({ message: `Invalid id format: ${update.id}` });
      }
      if (
        typeof update.estimatedPrice !== 'number' ||
        update.estimatedPrice < 0 ||
        update.estimatedPrice > 1
      ) {
        return res.status(400).json({
          message: `estimatedPrice must be a number between 0 and 1 for id ${update.id}`,
        });
      }
    }

    // Use transaction with individual updates (each condition gets a different price)
    const results = await prisma.$transaction(
      updates.map((u) =>
        prisma.condition.updateMany({
          where: { id: u.id },
          data: {
            estimatedPrice: u.estimatedPrice,
            ...(typeof u.similarMarketVolume === 'number' &&
            u.similarMarketVolume >= 0
              ? { similarMarketVolume: u.similarMarketVolume }
              : {}),
            ...(typeof u.similarMarketImage === 'string' &&
            isHttpUrl(u.similarMarketImage)
              ? { similarMarketImage: u.similarMarketImage }
              : {}),
          },
        })
      )
    );

    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      updated: totalUpdated,
      requested: updates.length,
    });
  } catch (error: unknown) {
    console.error('Error in batch price update:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Similar-market volume field names for validation and update building.
// These are Polymarket-derived volumes computed by the keeper.
const SIMILAR_MARKET_VOLUME_FIELDS = [
  'similarMarketVolume1h',
  'similarMarketVolume4h',
  'similarMarketVolume24h',
  'similarMarketVolume7d',
  'similarMarketVolumeFiltered1h',
  'similarMarketVolumeFiltered4h',
  'similarMarketVolumeFiltered24h',
  'similarMarketVolumeFiltered7d',
] as const;

// PUT /admin/conditions/volume - batch update time-bucketed volume on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching "volume" as an :id param
router.put('/volume', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<Record<string, unknown>>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    if (updates.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 updates' });
    }

    // Validate each update
    for (const update of updates) {
      if (
        typeof update.id !== 'string' ||
        !/^0x[0-9a-fA-F]{64}$/.test(update.id)
      ) {
        return res
          .status(400)
          .json({ message: `Invalid id format: ${update.id}` });
      }

      // Validate volume fields are non-negative numbers when present
      for (const field of SIMILAR_MARKET_VOLUME_FIELDS) {
        if (field in update) {
          if (typeof update[field] !== 'number' || update[field] < 0) {
            return res.status(400).json({
              message: `${field} must be a non-negative number for id ${update.id}`,
            });
          }
        }
      }
    }

    const results = await prisma.$transaction(
      updates.map((u) => {
        const data: Record<string, number> = {};
        for (const field of SIMILAR_MARKET_VOLUME_FIELDS) {
          if (typeof u[field] === 'number' && u[field] >= 0) {
            data[field] = u[field];
          }
        }
        return prisma.condition.updateMany({
          where: { id: u.id as string },
          data,
        });
      })
    );

    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      updated: totalUpdated,
      requested: updates.length,
    });
  } catch (error: unknown) {
    console.error('Error in batch volume update:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/batch-metadata - batch update metadata fields on multiple conditions
// Each condition gets different field values. Only touches syncable metadata fields.
// NOTE: Must be registered before /:id to avoid Express matching as an :id param
router.put('/batch-metadata', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<{
        id: string;
        fields: {
          question?: string;
          shortName?: string;
          optionName?: string;
          description?: string;
          similarMarkets?: string[];
          tags?: string[];
          similarMarketVolume?: number;
          similarMarketImage?: string;
          groupName?: string;
        };
      }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    // Validate IDs
    for (const u of updates) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(u.id)) {
        return res.status(400).json({ message: `Invalid id format: ${u.id}` });
      }
    }

    // Batch-resolve groupNames: find or create all referenced groups upfront
    const uniqueGroupNames = [
      ...new Set(
        updates.map((u) => u.fields.groupName?.trim()).filter(Boolean)
      ),
    ] as string[];

    const groupByName = new Map<string, number>();
    if (uniqueGroupNames.length > 0) {
      const existing = await prisma.conditionGroup.findMany({
        where: { name: { in: uniqueGroupNames } },
      });
      for (const g of existing) groupByName.set(g.name, g.id);

      for (const name of uniqueGroupNames) {
        if (!groupByName.has(name)) {
          try {
            const group = await prisma.conditionGroup.create({
              data: { name },
            });
            groupByName.set(name, group.id);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('Unique constraint')) {
              const found = await prisma.conditionGroup.findFirst({
                where: { name },
              });
              if (found) groupByName.set(name, found.id);
            }
          }
        }
      }
    }

    let updated = 0;
    let failed = 0;

    for (const u of updates) {
      const f = u.fields;
      const data: Record<string, unknown> = {};

      if (typeof f.question === 'string') data.question = f.question;
      if (typeof f.shortName === 'string')
        data.shortName = f.shortName.trim() || null;
      if (typeof f.optionName === 'string')
        data.optionName = f.optionName.trim() || null;
      if (typeof f.description === 'string') data.description = f.description;
      if (Array.isArray(f.similarMarkets))
        data.similarMarkets = f.similarMarkets;
      if (Array.isArray(f.tags)) data.tags = f.tags;
      if (
        typeof f.similarMarketVolume === 'number' &&
        f.similarMarketVolume >= 0
      )
        data.similarMarketVolume = f.similarMarketVolume;
      if (
        typeof f.similarMarketImage === 'string' &&
        isHttpUrl(f.similarMarketImage)
      )
        data.similarMarketImage = f.similarMarketImage;
      if (f.groupName?.trim()) {
        const groupId = groupByName.get(f.groupName.trim());
        if (groupId) {
          data.conditionGroupId = groupId;
          data.displayOrder = 0;
        }
      }

      if (Object.keys(data).length === 0) continue;

      try {
        await prisma.condition.update({ where: { id: u.id }, data });
        updated++;
      } catch {
        failed++;
      }
    }

    return res.status(200).json({ updated, failed, requested: updates.length });
  } catch (error: unknown) {
    console.error('Error in batch metadata update:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/batch-private - batch update visibility on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching as an :id param
router.put('/batch-private', async (req: Request, res: Response) => {
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
      optionName,
      categoryId,
      categorySlug,
      public: isPublic,
      description,
      similarMarkets,
      endTime,
      chainId,
      groupName,
      tags,
      estimatedPrice,
      similarMarketVolume,
      similarMarketImage,
    } = req.body as {
      question?: string;
      shortName?: string;
      optionName?: string;
      categoryId?: number;
      categorySlug?: string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      endTime?: number | string;
      chainId?: number;
      groupName?: string;
      tags?: string[];
      estimatedPrice?: number;
      similarMarketVolume?: number;
      similarMarketImage?: string;
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
          ...(typeof optionName !== 'undefined'
            ? {
                optionName:
                  optionName && optionName.trim().length > 0
                    ? optionName.trim()
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
          // Update estimatedPrice if provided and valid
          ...(typeof estimatedPrice === 'number' &&
          estimatedPrice >= 0 &&
          estimatedPrice <= 1
            ? { estimatedPrice }
            : {}),
          ...(typeof similarMarketVolume === 'number' &&
          similarMarketVolume >= 0
            ? { similarMarketVolume }
            : {}),
          ...(typeof similarMarketImage === 'string' &&
          isHttpUrl(similarMarketImage)
            ? { similarMarketImage }
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
      return res.json(
        JSON.parse(
          JSON.stringify(condition, (_k, v) =>
            typeof v === 'bigint' ? Number(v) : v
          )
        )
      );
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
