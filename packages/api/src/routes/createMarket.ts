import { marketGroupRepository, categoryRepository, marketRepository } from '../db';
import { Router } from 'express';
import { Request, Response } from 'express';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';

const router = Router();

// Handler for POST /create-market-group/:nonce
router.post(
  '/create-market-group/:nonce',
  async (req: Request, res: Response) => {
    const { nonce } = req.params;
    const {
      chainId,
      question,
      category: categorySlug,
      baseTokenName,
      quoteTokenName,
      factoryAddress,
    } = req.body;

    // TODO: find or create based on nonce chainId and Factory address

    try {
      if (
        !chainId ||
        !question ||
        !categorySlug ||
        !baseTokenName ||
        !quoteTokenName ||
        !factoryAddress
      ) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const category = await categoryRepository.findOne({
        where: { slug: categorySlug },
      });
      if (!category) {
        return res
          .status(404)
          .json({ message: `Category with slug ${categorySlug} not found` });
      }

      const newMarketGroup = new MarketGroup();
      newMarketGroup.chainId = parseInt(chainId, 10);
      newMarketGroup.question = question;
      newMarketGroup.baseTokenName = baseTokenName;
      newMarketGroup.quoteTokenName = quoteTokenName;
      newMarketGroup.initializationNonce = nonce;
      newMarketGroup.category = category;
      newMarketGroup.factoryAddress = factoryAddress;
      const savedMarketGroup = await marketGroupRepository.save(newMarketGroup);

      res.status(201).json(savedMarketGroup);
    } catch (error) {
      console.error('Error creating market group:', error);
      let errorMessage = 'Internal Server Error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      res.status(500).json({ message: errorMessage });
    }
  }
);

// Handler for POST /create-market/:chainId/:address
router.post('/create-market/:chainId/:address', async (req: Request, res: Response) => {
  const { address, chainId } = req.params;
  const {
    marketQuestion,
    optionName,
    startTime,
    endTime,
    startingSqrtPriceX96,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
  } = req.body;

  try {
    const marketGroup = await marketGroupRepository.findOne({
      where: { address, chainId: parseInt(chainId, 10) },
      relations: ['markets'],
    });

    if (!marketGroup) {
      return res
        .status(404)
        .json({ message: `Market Group with address ${address} not found` });
    }

    if (
      !marketQuestion ||
      !optionName ||
      startTime === undefined ||
      endTime === undefined ||
      !startingSqrtPriceX96 ||
      baseAssetMinPriceTick === undefined ||
      baseAssetMaxPriceTick === undefined
    ) {
      return res
        .status(400)
        .json({ message: 'Missing required market fields' });
    }

    let nextMarketId = 1;
    if (marketGroup.markets && marketGroup.markets.length > 0) {
      const validMarketIds = marketGroup.markets
        .map((m) => m.marketId)
        .filter((id) => typeof id === 'number' && !isNaN(id));

      if (validMarketIds.length > 0) {
        const maxMarketId = Math.max(...validMarketIds);
        nextMarketId = maxMarketId + 1;
      }
    }

    const newMarket = new Market();
    newMarket.marketGroup = marketGroup;
    newMarket.marketId = nextMarketId;
    newMarket.question = marketQuestion;
    newMarket.optionName = optionName;

    const savedMarket = await marketRepository.save(newMarket);

    res.status(201).json(savedMarket);
  } catch (error) {
    console.error('Error creating market:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    res.status(500).json({ message: errorMessage });
  }
});

export { router };
