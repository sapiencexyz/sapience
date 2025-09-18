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
      question,
      shortName,
      categoryId,
      categorySlug,
      endTime,
      public: isPublic = true,
      claimStatement,
      description,
      similarMarkets,
    } = req.body as {
      question?: string;
      shortName?: string;
      categoryId?: number;
      categorySlug?: string;
      endTime?: number | string;
      public?: boolean;
      claimStatement?: string;
      description?: string;
      similarMarkets?: string[];
    };

    if (!question || !endTime || !claimStatement || !description) {
      return res.status(400).json({ message: 'Missing required fields' });
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

    const endTimeInt = parseInt(String(endTime), 10);
    if (Number.isNaN(endTimeInt)) {
      return res.status(400).json({ message: 'Invalid endTime' });
    }

    // Enforce endTime is in the future (Unix seconds)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (endTimeInt <= nowSeconds) {
      return res
        .status(400)
        .json({ message: 'endTime must be a future Unix timestamp (seconds)' });
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

    // Solidity equivalent: keccak256(abi.encodePacked(claimStatement, ":", uint256(endTime)))
    const claimHex = toHex(claimStatement);
    const colonHex = toHex(':');
    const endTimeHex = toHex(BigInt(endTimeInt), { size: 32 });
    const packed = concatHex([claimHex, colonHex, endTimeHex]);
    const id = keccak256(packed);

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
          claimStatement,
          description,
          similarMarkets: Array.isArray(similarMarkets) ? similarMarkets : [],
        },
        include: { category: true },
      });
      return res.status(201).json(condition);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes('Unique constraint failed') ||
        message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          message: 'Condition already exists for claimStatement:endTime',
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
        },
        include: { category: true },
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
