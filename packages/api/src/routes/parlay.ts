import { Request, Response, Router } from 'express';
import prisma from '../db';

const router = Router();

// POST /parlay/incompatibility - Mark market groups as incompatible
router.post('/incompatibility', async (req: Request, res: Response) => {
  try {
    const { marketGroupAId, marketGroupBId, incompatibilityReason } = req.body;

    // Validate that market groups are different
    if (marketGroupAId === marketGroupBId) {
      return res.status(400).json({
        message: 'Cannot mark a market group as incompatible with itself',
      });
    }

    // Validate that both market groups exist
    const [marketGroupA, marketGroupB] = await Promise.all([
      prisma.marketGroup.findUnique({ where: { id: marketGroupAId } }),
      prisma.marketGroup.findUnique({ where: { id: marketGroupBId } }),
    ]);

    if (!marketGroupA || !marketGroupB) {
      return res.status(404).json({
        message: 'One or both market groups not found',
      });
    }

    const incompatibility = await prisma.parlayIncompatibility.upsert({
      where: {
        marketGroupAId_marketGroupBId: { marketGroupAId, marketGroupBId },
      },
      update: { incompatibilityReason },
      create: { marketGroupAId, marketGroupBId, incompatibilityReason },
    });

    return res.json(incompatibility);
  } catch (error) {
    console.error('Error creating incompatibility:', error);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

// DELETE /parlay/incompatibility - Remove incompatibility (make compatible)
router.delete('/incompatibility', async (req: Request, res: Response) => {
  try {
    const { marketGroupAId, marketGroupBId } = req.body;

    if (!marketGroupAId || !marketGroupBId) {
      return res.status(400).json({
        message: 'Both marketGroupAId and marketGroupBId are required',
      });
    }

    await prisma.parlayIncompatibility.deleteMany({
      where: {
        OR: [
          { marketGroupAId, marketGroupBId },
          { marketGroupAId: marketGroupBId, marketGroupBId: marketGroupAId }, // Also remove the inverse entry
        ],
      },
    });

    return res.json({ message: 'Incompatibility removed successfully' });
  } catch (error) {
    console.error('Error removing incompatibility:', error);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

// GET /parlay/incompatible-market-groups/:marketGroupId - Get incompatible market groups with a specific market group
router.get(
  '/incompatible-market-groups/:marketGroupId',
  async (req: Request, res: Response) => {
    try {
      const { marketGroupId } = req.params;

      const incompatibilities = await prisma.parlayIncompatibility.findMany({
        where: {
          OR: [
            { marketGroupAId: parseInt(marketGroupId) },
            { marketGroupBId: parseInt(marketGroupId) },
          ],
        },
        include: {
          marketGroupA: true,
          marketGroupB: true,
        },
      });

      // Transform to return only incompatible market groups
      const incompatibleMarketGroups = incompatibilities.map((inc) => {
        return inc.marketGroupAId === parseInt(marketGroupId)
          ? inc.marketGroupB
          : inc.marketGroupA;
      });

      return res.json(incompatibleMarketGroups);
    } catch (error) {
      console.error('Error getting incompatible market groups:', error);
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  }
);

// GET /parlay/check-compatibility - Check if two specific market groups are compatible
router.get('/check-compatibility', async (req: Request, res: Response) => {
  try {
    const { marketGroupAId, marketGroupBId } = req.query;

    if (!marketGroupAId || !marketGroupBId) {
      return res.status(400).json({
        message: 'Both marketGroupAId and marketGroupBId are required',
      });
    }

    const incompatibility = await prisma.parlayIncompatibility.findFirst({
      where: {
        OR: [
          {
            marketGroupAId: parseInt(marketGroupAId as string),
            marketGroupBId: parseInt(marketGroupBId as string),
          },
          {
            marketGroupAId: parseInt(marketGroupBId as string),
            marketGroupBId: parseInt(marketGroupAId as string),
          },
        ],
      },
    });

    return res.json({
      isCompatible: !incompatibility,
      incompatibilityReason: incompatibility?.incompatibilityReason || null,
    });
  } catch (error) {
    console.error('Error checking compatibility:', error);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

// GET /parlay/all-incompatibilities - Get all incompatibilities
router.get('/all-incompatibilities', async (req: Request, res: Response) => {
  try {
    const incompatibilities = await prisma.parlayIncompatibility.findMany({
      include: {
        marketGroupA: true,
        marketGroupB: true,
      },
    });

    return res.json(incompatibilities);
  } catch (error) {
    console.error('Error getting all incompatibilities:', error);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

// POST /parlay/get-parlay-chance - Calculate the success probability of a parlay
router.post('/get-parlay-chance', async (req: Request, res: Response) => {
  try {
    const { markets, marketPredictions } = req.body;

    // Validate that market predictions are provided
    if (
      !marketPredictions ||
      !Array.isArray(marketPredictions) ||
      marketPredictions.length === 0
    ) {
      return res.status(400).json({
        message: 'Market predictions array is required and must not be empty',
      });
    }

    // Validate inputs and parse markets in a single loop
    if (!markets || !Array.isArray(markets) || markets.length === 0) {
      return res.status(400).json({
        message: 'Markets array is required and must not be empty',
      });
    }

    if (markets.length !== marketPredictions.length) {
      return res.status(400).json({
        message: 'Markets and market predictions must have the same length',
      });
    }

    // Check for duplicates and validate format in one pass
    const uniqueMarkets = new Set();
    const marketIds = [];
    const marketGroupIds = new Set();

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      const prediction = marketPredictions[i];

      // Validate market format
      if (typeof market !== 'string' || !market.includes('/')) {
        return res.status(400).json({
          message:
            'Each market must be in format "marketGroupAddress/marketIdx"',
        });
      }

      // Check for duplicates
      if (uniqueMarkets.has(market)) {
        return res.status(400).json({
          message: 'Markets array must contain unique markets',
        });
      }
      uniqueMarkets.add(market);

      // Validate prediction type
      if (typeof prediction !== 'boolean') {
        return res.status(400).json({
          message: 'Each market prediction must be a boolean',
        });
      }

      // Parse and validate market exists
      const [marketGroupAddress, marketIdx] = market.split('/');
      const marketExists = await prisma.market.findFirst({
        where: {
          market_group: { address: marketGroupAddress },
          marketId: parseInt(marketIdx),
        },
        include: { market_group: true },
      });

      if (!marketExists) {
        return res.status(400).json({
          message: `Market ${marketGroupAddress}/${marketIdx} does not exist`,
        });
      }

      marketIds.push(marketExists.id);
      if (marketExists.market_group) {
        marketGroupIds.add(marketExists.market_group.id);
      }
    }

    // Validate that market groups are not incompatible with each other
    const marketGroupIdsArray = Array.from(marketGroupIds);
    for (let i = 0; i < marketGroupIdsArray.length; i++) {
      for (let j = i + 1; j < marketGroupIdsArray.length; j++) {
        const marketGroupAId = marketGroupIdsArray[i] as number;
        const marketGroupBId = marketGroupIdsArray[j] as number;

        const incompatibility = await prisma.parlayIncompatibility.findFirst({
          where: {
            OR: [
              { marketGroupAId, marketGroupBId },
              {
                marketGroupAId: marketGroupBId,
                marketGroupBId: marketGroupAId,
              },
            ],
          },
        });

        if (incompatibility) {
          return res.status(400).json({
            message: `Market groups ${marketGroupAId} and ${marketGroupBId} are incompatible`,
          });
        }
      }
    }

    // Calculate the parlay chance
    let parlayChance = 1;
    for (let i = 0; i < marketIds.length; i++) {
      const marketId = marketIds[i];
      const marketPrediction = marketPredictions[i];
      const chanceForYes = await getChanceForYes(marketId);
      const chanceForNo = 1 - chanceForYes;
      parlayChance *= marketPrediction ? chanceForYes : chanceForNo;
    }

    return res.json({
      parlayChance,
      markets: markets,
      message: 'Parlay chance calculated successfully',
    });
  } catch (error) {
    console.error('Error calculating parlay chance:', error);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

async function getChanceForYes(marketId: number) {
  if (marketId === 1) {
    return 0.7;
  }
  if (marketId === 2) {
    return 0.3;
  }
  return 0.5;
}

export { router };
