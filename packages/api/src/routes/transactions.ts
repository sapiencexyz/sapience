import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers/validateRequestParams';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import prisma from '../db';
import { hydrateTransactions } from '../helpers/hydrateTransactions';
import type { Prisma } from '../../generated/prisma';

const router = Router();

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { contractId, epochId, positionId } = req.query as {
      contractId: string;
      epochId?: string;
      positionId?: string;
    };

    const { chainId, address } = parseContractId(contractId);

    // Build the where clause
    const whereClause: Prisma.transactionWhereInput = {
      position: {
        market: {
          market_group: {
            chainId: parseInt(chainId),
            address: address.toLowerCase(),
          },
        },
      },
    };

    // Add optional filters
    if (epochId) {
      // Note: In the new schema, there's no direct epoch relationship
      // This might need to be adjusted based on your business logic
      // For now, we'll use marketId as a substitute if that's what epochId represents
      if (whereClause.position && whereClause.position.market) {
        whereClause.position.market.marketId = parseInt(epochId);
      }
    }

    if (positionId) {
      if (whereClause.position) {
        whereClause.position.positionId = parseInt(positionId);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        position: {
          include: {
            market: {
              include: {
                market_group: {
                  include: {
                    resource: true,
                  },
                },
              },
            },
          },
        },
        event: true,
      },
      orderBy: [
        { position: { positionId: 'asc' } },
        { event: { blockNumber: 'asc' } },
      ],
    });

    const hydratedPositions = hydrateTransactions(transactions);

    res.json(hydratedPositions);
  })
);

export { router };
