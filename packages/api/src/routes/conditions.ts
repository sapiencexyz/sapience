import { Request, Response, Router } from 'express';
import prisma from '../db';
import { keccak256, toHex, concatHex } from 'viem';

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
      claimStatement,
      description,
      similarMarkets,
      chainId,
      groupName,
      resolver,
    } = req.body as {
      conditionHash?: string;
      question?: string;
      shortName?: string;
      categoryId?: number;
      categorySlug?: string;
      endTime?: number | string;
      public?: boolean;
      claimStatement?: string;
      description?: string;
      similarMarkets?: string[];
      chainId?: number;
      groupName?: string;
      resolver?: string;
    };

    // Validate conditionHash if provided (must be 0x-prefixed 32-byte hex)
    if (conditionHash && !/^0x[0-9a-fA-F]{64}$/.test(conditionHash)) {
      return res.status(400).json({ message: 'conditionHash must be a 0x-prefixed 32-byte hex string' });
    }
    
    if (!question || !endTime || !description) {
      return res.status(400).json({ message: `Missing required fields: ${!question ? 'question' : ''}${!endTime ? ' endTime ' : ''}${!description ? ' description' : ''}` });
    }

    // When conditionHash is provided, claimStatement and resolver are optional
    // Otherwise, both are required for computing the condition ID
    if (!conditionHash) {
      if (!claimStatement || !resolver) {
        return res.status(400).json({ message: 'claimStatement and resolver are required when conditionHash is not provided' });
      }
      // Validate resolver is a valid Ethereum address
      if (typeof resolver !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(resolver)) {
        return res.status(400).json({ message: 'Resolver must be a valid Ethereum address (0x...)' });
      }
    } else if (resolver) {
      // If resolver is provided with conditionHash, still validate it
      if (typeof resolver !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(resolver)) {
        return res.status(400).json({ message: 'Resolver must be a valid Ethereum address (0x...)' });
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
      return res
        .status(400)
        .json({ message: `endTime must be a future Unix timestamp (seconds), endTime: ${endTimeInt}, nowSeconds: ${nowSeconds}` });
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

    // Use provided conditionHash or compute from claimStatement and endTime
    let id: string;
    if (conditionHash) {
      id = conditionHash;
    } else {
      // Solidity equivalent: keccak256(abi.encodePacked(claimStatement, ":", uint256(endTime)))
      const claimHex = toHex(claimStatement!);
      const colonHex = toHex(':');
      const endTimeHex = toHex(BigInt(endTimeInt), { size: 32 });
      const packed = concatHex([claimHex, colonHex, endTimeHex]);
      id = keccak256(packed);
    }

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
          claimStatement: claimStatement || '', // Empty string if not provided (for external conditions like Polymarket)
          description,
          similarMarkets: Array.isArray(similarMarkets) ? similarMarkets : [],
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

// PUT /admin/conditions/:id - update editable fields (cannot change claimStatement or endTime)
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
      claimStatement,
      endTime,
      chainId,
      groupName,
    } = req.body as {
      question?: string;
      shortName?: string;
      categoryId?: number;
      categorySlug?: string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      claimStatement?: string;
      endTime?: number | string;
      chainId?: number;
      groupName?: string;
    };

    const existing = await prisma.condition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Condition not found' });
    }

    if (
      typeof claimStatement !== 'undefined' &&
      claimStatement !== existing.claimStatement
    ) {
      return res
        .status(400)
        .json({ message: 'claimStatement cannot be changed' });
    }

    if (typeof endTime !== 'undefined') {
      const endTimeInt = parseInt(String(endTime), 10);
      if (Number.isNaN(endTimeInt)) {
        return res.status(400).json({ message: 'Invalid endTime' });
      }
      if (endTimeInt !== existing.endTime) {
        return res.status(400).json({ message: 'endTime cannot be changed' });
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
