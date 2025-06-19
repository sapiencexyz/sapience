import { Request, Response, Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import { validateRequestParams } from '../helpers/validateRequestParams';
import prisma from '../db';
import { formatDbBigInt } from '../utils/utils';

const router = Router();

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { isLP, contractId } = req.query as {
      isLP: string;
      contractId: string;
    };

    const { chainId, address } = parseContractId(contractId);

    const marketGroup = await prisma.market_group.findFirst({
      where: {
        chainId: Number(chainId),
        address: String(address).toLowerCase(),
      },
    });

    if (!marketGroup) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    // Query for positions related to any epoch of this market
    const whereCondition: any = {
      market: { 
        marketGroupId: marketGroup.id 
      },
    };

    if (isLP === 'true') {
      whereCondition.isLP = true;
    }

    const positions = await prisma.position.findMany({
      where: whereCondition,
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
      orderBy: { positionId: 'asc' },
    });

    // Format the data
    const formattedPositions = positions.map((position) => ({
      ...position,
      baseToken: position.baseToken ? formatDbBigInt(position.baseToken.toString()) : null,
      quoteToken: position.quoteToken ? formatDbBigInt(position.quoteToken.toString()) : null,
      borrowedBaseToken: position.borrowedBaseToken ? formatDbBigInt(position.borrowedBaseToken.toString()) : null,
      borrowedQuoteToken: position.borrowedQuoteToken ? formatDbBigInt(position.borrowedQuoteToken.toString()) : null,
      collateral: formatDbBigInt(position.collateral.toString()),
      lpBaseToken: position.lpBaseToken ? formatDbBigInt(position.lpBaseToken.toString()) : null,
      lpQuoteToken: position.lpQuoteToken ? formatDbBigInt(position.lpQuoteToken.toString()) : null,
    }));
    res.json(formattedPositions);
  })
);

router.get(
  '/:positionId',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { positionId } = req.params;
    const { contractId } = req.query as { contractId: string };

    const { chainId, address } = parseContractId(contractId);

    const marketGroup = await prisma.market_group.findFirst({
      where: {
        chainId: Number(chainId),
        address: String(address).toLowerCase(),
      },
    });

    if (!marketGroup) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const position = await prisma.position.findFirst({
      where: {
        positionId: Number(positionId),
        market: { 
          marketGroupId: marketGroup.id 
        },
      },
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
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Format the data
    const formattedPosition = {
      ...position,
      baseToken: position.baseToken ? formatDbBigInt(position.baseToken.toString()) : null,
      quoteToken: position.quoteToken ? formatDbBigInt(position.quoteToken.toString()) : null,
      borrowedBaseToken: position.borrowedBaseToken ? formatDbBigInt(position.borrowedBaseToken.toString()) : null,
      borrowedQuoteToken: position.borrowedQuoteToken ? formatDbBigInt(position.borrowedQuoteToken.toString()) : null,
      collateral: formatDbBigInt(position.collateral.toString()),
      lpBaseToken: position.lpBaseToken ? formatDbBigInt(position.lpBaseToken.toString()) : null,
      lpQuoteToken: position.lpQuoteToken ? formatDbBigInt(position.lpQuoteToken.toString()) : null,
    };

    res.json(formattedPosition);
  })
);

export { router };
