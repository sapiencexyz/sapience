import { Request, Response, Router } from 'express';
import prisma from '../db';

const router = Router();

// POST /parlay/incompatibility - Mark markets as incompatible
router.post('/incompatibility', async (req: Request, res: Response) => {
  try {
    const { marketAId, marketBId, incompatibilityReason } = req.body;

    // Validate that markets are different
    if (marketAId === marketBId) {
      return res.status(400).json({
        message: 'Cannot mark a market as incompatible with itself',
      });
    }

    // Validate that both markets exist
    const [marketA, marketB] = await Promise.all([
      prisma.market.findUnique({ where: { id: marketAId } }),
      prisma.market.findUnique({ where: { id: marketBId } }),
    ]);

    if (!marketA || !marketB) {
      return res.status(404).json({
        message: 'One or both markets not found',
      });
    }

    const incompatibility = await prisma.parlayIncompatibility.upsert({
      where: {
        marketAId_marketBId: { marketAId, marketBId },
      },
      update: { incompatibilityReason },
      create: { marketAId, marketBId, incompatibilityReason },
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
    const { marketAId, marketBId } = req.body;

    if (!marketAId || !marketBId) {
      return res.status(400).json({
        message: 'Both marketAId and marketBId are required',
      });
    }

    await prisma.parlayIncompatibility.deleteMany({
      where: {
        OR: [
          { marketAId, marketBId },
          { marketAId: marketBId, marketBId: marketAId }, // Also remove the inverse entry
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

// GET /parlay/incompatible-markets/:marketId - Get incompatible markets with a specific market
router.get(
  '/incompatible-markets/:marketId',
  async (req: Request, res: Response) => {
    try {
      const { marketId } = req.params;

      const incompatibilities = await prisma.parlayIncompatibility.findMany({
        where: {
          OR: [
            { marketAId: parseInt(marketId) },
            { marketBId: parseInt(marketId) },
          ],
        },
        include: {
          marketA: true,
          marketB: true,
        },
      });

      // Transform to return only incompatible markets
      const incompatibleMarkets = incompatibilities.map((inc) => {
        return inc.marketAId === parseInt(marketId) ? inc.marketB : inc.marketA;
      });

      return res.json(incompatibleMarkets);
    } catch (error) {
      console.error('Error getting incompatible markets:', error);
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  }
);

// GET /parlay/compatible-markets/:marketId - Get compatible markets with a specific market
router.get(
  '/compatible-markets/:marketId',
  async (req: Request, res: Response) => {
    try {
      const { marketId } = req.params;
      const marketIdInt = parseInt(marketId);

      // Get all markets
      const allMarkets = await prisma.market.findMany({
        where: { id: { not: marketIdInt } }, // Exclude current market
      });

      // Get incompatibilities
      const incompatibilities = await prisma.parlayIncompatibility.findMany({
        where: {
          OR: [{ marketAId: marketIdInt }, { marketBId: marketIdInt }],
        },
      });

      // Create set of incompatible IDs for fast lookup
      const incompatibleIds = new Set(
        incompatibilities.map((inc) =>
          inc.marketAId === marketIdInt ? inc.marketBId : inc.marketAId
        )
      );

      // Filter compatible markets
      const compatibleMarkets = allMarkets.filter(
        (market) => !incompatibleIds.has(market.id)
      );

      return res.json(compatibleMarkets);
    } catch (error) {
      console.error('Error getting compatible markets:', error);
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  }
);

// GET /parlay/check-compatibility - Check if two specific markets are compatible
router.get('/check-compatibility', async (req: Request, res: Response) => {
  try {
    const { marketAId, marketBId } = req.query;

    if (!marketAId || !marketBId) {
      return res.status(400).json({
        message: 'Both marketAId and marketBId are required',
      });
    }

    const incompatibility = await prisma.parlayIncompatibility.findFirst({
      where: {
        OR: [
          {
            marketAId: parseInt(marketAId as string),
            marketBId: parseInt(marketBId as string),
          },
          {
            marketAId: parseInt(marketBId as string),
            marketBId: parseInt(marketAId as string),
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
        marketA: true,
        marketB: true,
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
    }

    // Validate that markets are not incompatible with each other
    for (let i = 0; i < marketIds.length; i++) {
      for (let j = i + 1; j < marketIds.length; j++) {
        const marketAId = marketIds[i];
        const marketBId = marketIds[j];

        const incompatibility = await prisma.parlayIncompatibility.findFirst({
          where: {
            OR: [
              { marketAId, marketBId },
              { marketAId: marketBId, marketBId: marketAId },
            ],
          },
        });

        if (incompatibility) {
          return res.status(400).json({
            message: `Markets ${marketIds[i]} and ${marketIds[j]} are incompatible`,
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
