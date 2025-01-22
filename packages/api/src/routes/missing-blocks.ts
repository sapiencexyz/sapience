import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { Between } from 'typeorm';
import { Market } from '../models/Market';
import { ResourcePrice } from '../models/ResourcePrice';
import { MARKETS } from 'src/fixtures';
import { getMarketStartEndBlock } from 'src/controllers/marketHelpers';
import dataSource from 'src/db';

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

  // Find the market info to get the correct chain for price indexing
  const marketInfo = MARKETS.find(
    (m) =>
      m.marketChainId === market.chainId &&
      m.deployment.address.toLowerCase() === market.address.toLowerCase()
  );
  if (!marketInfo) {
    return {
      missingBlockNumbers: null,
      error: 'Market configuration not found',
    };
  }

  // Get block numbers using the price indexer client
  const { startBlockNumber, endBlockNumber, error } =
    await getMarketStartEndBlock(
      market,
      epochId,
      marketInfo.resource.priceIndexer.client
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
  '/missing-blocks',
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

export default router;
