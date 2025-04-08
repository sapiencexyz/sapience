import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { Between } from 'typeorm';
import { Market } from '../models/Market';
import { ResourcePrice } from '../models/ResourcePrice';
import { getMarketStartEndBlock } from 'src/controllers/marketHelpers';
import dataSource from 'src/db';
import { INDEXERS } from '../fixtures';

const router = Router();

const marketRepository = dataSource.getRepository(Market);
const resourcePriceRepository = dataSource.getRepository(ResourcePrice);

const getMissingBlocks = async (
  chainId: string,
  address: string,
  epochId: string
): Promise<{ missingBlockNumbers: number[] | null; error?: string }> => {
  // Find the market
  const market = await marketRepository.findOne({
    where: { chainId: Number(chainId), address },
    relations: ['resource'],
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
    await getMarketStartEndBlock(
      market,
      epochId,
      indexer
    );

  if (error || !startBlockNumber || !endBlockNumber) {
    return { missingBlockNumbers: null, error };
  }

  // Get existing block numbers for ResourcePrice
  const resourcePrices = await resourcePriceRepository.find({
    where: {
      resource: { id: market.resource.id },
      blockNumber: Between(startBlockNumber, endBlockNumber),
    },
    select: ['blockNumber'],
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
  validateRequestParams(['chainId', 'address', 'epochId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { chainId, address, epochId } = req.query as {
      chainId: string;
      address: string;
      epochId: string;
    };

    const { missingBlockNumbers, error } = await getMissingBlocks(
      chainId,
      address,
      epochId
    );

    if (error) {
      res.status(500).json({ error });
      return;
    }

    res.json({ missingBlockNumbers });
  })
);

export { router };
