import {
  marketGroupRepository,
  categoryRepository,
  marketRepository,
  resourceRepository,
} from '../db';
import { Router } from 'express';
import { Request, Response } from 'express';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';
import { MarketParams } from '../models/MarketParams';
import { watchFactoryAddress } from '../workers/jobs/indexMarkets';

const router = Router();

// Handler for POST /create-market-group
router.post('/create-market-group', async (req: Request, res: Response) => {
  try {
    const {
      nonce,
      chainId,
      question,
      category: categorySlug,
      baseTokenName,
      quoteTokenName,
      factoryAddress,
      owner,
      collateralAsset,
      minTradeSize,
      marketParams,
      resourceId,
      isCumulative,
      markets,
    } = req.body;

    // Validate required market group fields
    if (
      !nonce ||
      !chainId ||
      !question ||
      !categorySlug ||
      !baseTokenName ||
      !quoteTokenName ||
      !factoryAddress ||
      !owner ||
      !collateralAsset ||
      !minTradeSize ||
      !marketParams ||
      typeof marketParams !== 'object' ||
      !markets ||
      !Array.isArray(markets) ||
      markets.length === 0
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if market group already exists
    const existingMarketGroup = await marketGroupRepository.findOne({
      where: {
        chainId: parseInt(chainId, 10),
        factoryAddress: factoryAddress.toLowerCase(),
        initializationNonce: nonce,
      },
    });

    if (existingMarketGroup) {
      return res.status(400).json({
        message:
          'Market group with the same nonce, chainId and factory address already exists',
      });
    }

    // Find category
    const category = await categoryRepository.findOne({
      where: { slug: categorySlug },
    });
    if (!category) {
      return res
        .status(404)
        .json({ message: `Category with slug ${categorySlug} not found` });
    }

    // Find resource if resourceId is provided
    let resource = null;
    if (resourceId) {
      resource = await resourceRepository.findOne({
        where: { id: resourceId },
      });
      if (!resource) {
        return res
          .status(404)
          .json({ message: `Resource with id ${resourceId} not found` });
      }
    }

    // Create market group
    const newMarketGroup = new MarketGroup();
    newMarketGroup.chainId = parseInt(chainId, 10);
    newMarketGroup.question = question;
    newMarketGroup.baseTokenName = baseTokenName;
    newMarketGroup.quoteTokenName = quoteTokenName;
    newMarketGroup.initializationNonce = nonce;
    newMarketGroup.category = category;
    newMarketGroup.factoryAddress = factoryAddress.toLowerCase();
    newMarketGroup.owner = owner;
    newMarketGroup.collateralAsset = collateralAsset;
    newMarketGroup.minTradeSize = minTradeSize;
    newMarketGroup.marketParams = marketParams;

    // Set resource if provided
    if (resource) {
      newMarketGroup.resource = resource;

      // Set isCumulative if provided with a resource
      if (isCumulative !== undefined) {
        newMarketGroup.isCumulative = isCumulative;
      }
    }

    const savedMarketGroup = await marketGroupRepository.save(newMarketGroup);

    // Check for new factory address
    const existingFactoryAddresses = await marketGroupRepository
      .createQueryBuilder('marketGroup')
      .select('DISTINCT "factoryAddress"')
      .where(
        '"marketGroup"."chainId" = :chainId AND "marketGroup"."factoryAddress" = :factoryAddress',
        {
          chainId: parseInt(chainId, 10),
          factoryAddress: factoryAddress.toLowerCase(),
        }
      )
      .getRawMany();

    // Set up watcher for new factory address
    if (existingFactoryAddresses.length === 1) {
      console.log(
        `Setting up watcher for new factory address: ${factoryAddress.toLowerCase()}`
      );
      try {
        await watchFactoryAddress(
          parseInt(chainId, 10),
          factoryAddress.toLowerCase()
        );
      } catch (error) {
        console.error(
          `Error setting up watcher for new factory address: ${factoryAddress.toLowerCase()}`,
          error
        );
      }
    }

    // Create markets
    const savedMarkets = [];
    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      const {
        marketQuestion,
        optionName,
        startTime,
        endTime,
        startingSqrtPriceX96,
        baseAssetMinPriceTick,
        baseAssetMaxPriceTick,
        claimStatement,
      } = market;

      // Validate required market fields
      if (
        !marketQuestion ||
        !optionName ||
        !claimStatement ||
        startTime === undefined ||
        endTime === undefined ||
        !startingSqrtPriceX96 ||
        baseAssetMinPriceTick === undefined ||
        baseAssetMaxPriceTick === undefined
      ) {
        return res.status(400).json({
          message: `Missing required fields for market ${i + 1}`,
        });
      }

      // Create market
      const newMarket = new Market();
      newMarket.marketGroup = savedMarketGroup;
      newMarket.marketId = i + 1;
      newMarket.question = marketQuestion;
      newMarket.optionName = optionName;

      // Initialize marketParams if it doesn't exist
      if (!newMarket.marketParams) {
        newMarket.marketParams = new MarketParams();
      }
      newMarket.marketParams.claimStatement = claimStatement;

      newMarket.startTimestamp = parseInt(startTime, 10);
      newMarket.endTimestamp = parseInt(endTime, 10);
      newMarket.startingSqrtPriceX96 = startingSqrtPriceX96;
      newMarket.baseAssetMinPriceTick = parseInt(baseAssetMinPriceTick, 10);
      newMarket.baseAssetMaxPriceTick = parseInt(baseAssetMaxPriceTick, 10);

      // Initialize other fields
      newMarket.poolAddress = null;
      newMarket.settlementPriceD18 = null;
      newMarket.settled = null;
      newMarket.minPriceD18 = null;
      newMarket.maxPriceD18 = null;

      const savedMarket = await marketRepository.save(newMarket);
      savedMarkets.push(savedMarket);
    }

    // Return the created market group and markets
    return res.status(201).json({
      marketGroup: savedMarketGroup,
      markets: savedMarkets,
    });
  } catch (error) {
    console.error('Error creating combined market group and markets:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    return res.status(500).json({ message: errorMessage });
  }
});

export { router };
