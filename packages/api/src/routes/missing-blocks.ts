import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { getMarketStartEndBlock } from 'src/controllers/marketHelpers';
import prisma from 'src/db';
import { INDEXERS } from '../fixtures';

const router = Router();

const getMissingBlocks = async (
  chainId: string,
  address: string,
  marketId: string
): Promise<{ missingBlockNumbers: number[] | null; error?: string }> => {
  // Find the market
  const market = await prisma.market_group.findFirst({
    where: { chainId: Number(chainId), address: address.toLowerCase() },
    include: { resource: true },
  });
  if (!market) {
    return { missingBlockNumbers: null, error: 'Market not found' };
  }

  // Get the resource slug to find the appropriate indexer
  if (!market.resource?.slug) {
    return {
      missingBlockNumbers: null,
      error: 'Market resource not found or missing slug',
    };
  }

  // Use the indexer for this resource from fixtures
  const indexer = INDEXERS[market.resource.slug];
  if (!indexer) {
    return {
      missingBlockNumbers: null,
      error: `Indexer not found for resource: ${market.resource.slug}`,
    };
  }

  // Get block numbers using the price indexer client
  const { startBlockNumber, endBlockNumber, error } =
    await getMarketStartEndBlock(market, marketId, indexer.client);

  if (error || !startBlockNumber || !endBlockNumber) {
    return { missingBlockNumbers: null, error };
  }

  // Get existing block numbers for ResourcePrice
  const resourcePrices = await prisma.resource_price.findMany({
    where: {
      resourceId: market.resource.id,
      blockNumber: {
        gte: startBlockNumber,
        lte: endBlockNumber,
      },
    },
    select: { blockNumber: true },
  });

  const existingBlockNumbersSet = new Set(
    resourcePrices.map((ip) => Number(ip.blockNumber))
  );

  // Find missing block numbers within the range
  const missingBlockNumbers = [];
  for (
    let blockNumber = startBlockNumber;
    blockNumber <= endBlockNumber;
    blockNumber++
  ) {
    if (!existingBlockNumbersSet.has(blockNumber)) {
      missingBlockNumbers.push(blockNumber);
    }
  }

  return { missingBlockNumbers };
};

router.get(
  '/',
  validateRequestParams(['chainId', 'address', 'marketId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { chainId, address, marketId } = req.query as {
      chainId: string;
      address: string;
      marketId: string;
    };

    const { missingBlockNumbers, error } = await getMissingBlocks(
      chainId,
      address,
      marketId
    );

    if (error) {
      res.status(500).json({ error });
      return;
    }

    res.json({ missingBlockNumbers });
  })
);

export { router };
