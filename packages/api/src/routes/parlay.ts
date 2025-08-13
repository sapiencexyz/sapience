import { Request, Response, Router } from 'express';
import prisma from '../db';

const router = Router();

// POST /parlay/incompatibility - Marcar markets como incompatibles
router.post('/incompatibility', async (req: Request, res: Response) => {
  try {
    const { marketAId, marketBId, incompatibilityReason } = req.body;

    // Validar que los markets sean diferentes
    if (marketAId === marketBId) {
      return res.status(400).json({
        message: 'Cannot mark a market as incompatible with itself',
      });
    }

    // Validar que ambos markets existan
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

// DELETE /parlay/incompatibility - Remover incompatibilidad (hacer compatibles)
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
          { marketAId: marketBId, marketBId: marketAId }, // También eliminar la entrada inversa
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

// GET /parlay/incompatible-markets/:marketId - Obtener markets incompatibles con un market específico
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

      // Transformar para devolver solo los markets incompatibles
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

// GET /parlay/compatible-markets/:marketId - Obtener markets compatibles con un market específico
router.get(
  '/compatible-markets/:marketId',
  async (req: Request, res: Response) => {
    try {
      const { marketId } = req.params;
      const marketIdInt = parseInt(marketId);

      // Obtener todos los markets
      const allMarkets = await prisma.market.findMany({
        where: { id: { not: marketIdInt } }, // Excluir el market actual
      });

      // Obtener incompatibilidades
      const incompatibilities = await prisma.parlayIncompatibility.findMany({
        where: {
          OR: [{ marketAId: marketIdInt }, { marketBId: marketIdInt }],
        },
      });

      // Crear set de IDs incompatibles para búsqueda rápida
      const incompatibleIds = new Set(
        incompatibilities.map((inc) =>
          inc.marketAId === marketIdInt ? inc.marketBId : inc.marketAId
        )
      );

      // Filtrar markets compatibles
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

// GET /parlay/check-compatibility - Verificar si dos markets específicos son compatibles
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

// GET /parlay/all-incompatibilities - Obtener todas las incompatibilidades
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

// POST /parlay/get-parlay-chance - Calcular la probabilidad de éxito de un parlay
router.post('/get-parlay-chance', async (req: Request, res: Response) => {
  try {
    const { markets } = req.body;

    // Validar que se proporcione la lista de markets
    if (!markets || !Array.isArray(markets) || markets.length === 0) {
      return res.status(400).json({
        message: 'Markets array is required and must not be empty',
      });
    }

    // Validar formato de cada market (marketGroupAddress/marketId)
    for (const market of markets) {
      if (typeof market !== 'string' || !market.includes('/')) {
        return res.status(400).json({
          message:
            'Each market must be in format "marketGroupAddress/marketId"',
        });
      }
    }

    // Por ahora, devolver siempre 0.7 como valor genérico
    const parlayChance = 0.7;

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

export { router };
