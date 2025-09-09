import { Request, Response, Router } from 'express';
import prisma from '../db';
import { keccak256, toHex, concatHex } from 'viem';

const router = Router();

// GET /admin/conditions - list conditions (basic pagination)
router.get('/', async (req: Request, res: Response) => {
  try {
    const take = Math.min(parseInt(String(req.query.take ?? '50'), 10), 200);
    const skip = parseInt(String(req.query.skip ?? '0'), 10);

    const conditions = await prisma.condition.findMany({
      take: Number.isNaN(take) ? 50 : take,
      skip: Number.isNaN(skip) ? 0 : skip,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });

    return res.json({ conditions });
  } catch (error: unknown) {
    console.error('Error listing conditions:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /admin/conditions - create a condition
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      question,
      categoryId,
      categorySlug,
      endTime,
      public: isPublic = true,
      claimStatement,
      description,
      similarMarkets,
    } = req.body as {
      question?: string;
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
          categoryId: resolvedCategoryId ?? undefined,
          endTime: endTimeInt,
          public: Boolean(isPublic),
          claimStatement,
          description,
          similarMarkets: Array.isArray(similarMarkets)
            ? similarMarkets
            : [],
        },
        include: { category: true },
      });
      return res.status(201).json(condition);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Unique constraint failed') || message.includes('Unique constraint')) {
        return res
          .status(409)
          .json({ message: 'Condition already exists for claimStatement:endTime' });
      }
      console.error('Error creating condition:', e);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error in create condition:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE /admin/conditions/:id - delete by id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate 0x-prefixed 32-byte hex string
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    try {
      await prisma.condition.delete({ where: { id } });
      return res.status(204).send();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Record to delete does not exist')) {
        return res.status(404).json({ message: 'Condition not found' });
      }
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    console.error('Error deleting condition:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };


