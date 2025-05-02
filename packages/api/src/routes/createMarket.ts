import {
  marketGroupRepository,
  categoryRepository,
  marketRepository,
} from '../db';
import { Router } from 'express';
import { Request, Response } from 'express';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';
import { MarketParams } from '../models/MarketParams';
import { watchFactoryAddress } from '../workers/jobs/indexMarkets';

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
      owner,
      collateralAsset,
      minTradeSize,
      marketParams,
    } = req.body;

    // if the market group already exists (nonce + chainId + factoryAddress triplet), return HTTP 400 with a message
    const marketGroup = await marketGroupRepository.findOne({
      where: {
        chainId: parseInt(chainId, 10),
        factoryAddress: factoryAddress.toLowerCase(),
        initializationNonce: nonce,
      },
    });

    if (marketGroup) {
      return res.status(400).json({
        message:
          'Market group with the same nonce, chainId and factory address already exists',
      });
    }

    try {
      if (
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
        typeof marketParams !== 'object'
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
      newMarketGroup.factoryAddress = factoryAddress.toLowerCase();
      newMarketGroup.owner = owner;
      newMarketGroup.collateralAsset = collateralAsset;
      newMarketGroup.minTradeSize = minTradeSize;
      newMarketGroup.marketParams = marketParams;

      const savedMarketGroup = await marketGroupRepository.save(newMarketGroup);

      // Check if this is a new factory address for this chain
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

      // If this is a new factory address (count is exactly 1, meaning only our newly saved entry),
      // set up a watcher for it
      if (existingFactoryAddresses.length === 1) {
        console.log(
          `Setting up watcher for new factory address: ${factoryAddress.toLowerCase()}`
        );
        try {
          // Set up a watcher for this new factory address
          await watchFactoryAddress(
            parseInt(chainId, 10),
            factoryAddress.toLowerCase()
          );
        } catch (error) {
          console.error(
            `Error setting up watcher for new factory address: ${factoryAddress.toLowerCase()}`,
            error
          );
          // Don't fail the creation of the market group if setting up the watcher fails
        }
      }

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
router.post(
  '/create-market/:chainId/:address',
  async (req: Request, res: Response) => {
    const { address, chainId } = req.params;
    const {
      marketQuestion,
      optionName,
      startTime,
      endTime,
      startingSqrtPriceX96,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
      claimStatement, // Add claimStatement to destructuring
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

      // Update validation to include claimStatement and check others properly
      if (
        !marketQuestion ||
        !optionName ||
        !claimStatement || // Validate claimStatement
        startTime === undefined || // Keep using undefined checks for potentially 0 values
        endTime === undefined ||
        !startingSqrtPriceX96 ||
        baseAssetMinPriceTick === undefined ||
        baseAssetMaxPriceTick === undefined
      ) {
        return res
          .status(400)
          .json({ message: 'Missing required market fields' });
      }

      // Logic to determine nextMarketId remains the same
      let nextMarketId = 1;
      if (marketGroup.markets && marketGroup.markets.length > 0) {
        const validMarketIds = marketGroup.markets
          .map((m) => m.marketId)
          .filter((id): id is number => typeof id === 'number' && !isNaN(id)); // Ensure type is number

        if (validMarketIds.length > 0) {
          const maxMarketId = Math.max(...validMarketIds);
          nextMarketId = maxMarketId + 1;
        }
      }

      // Remove salt generation
      // const salt = `0x${crypto.randomBytes(18).toString('hex')}`;

      const newMarket = new Market();
      newMarket.marketGroup = marketGroup;
      newMarket.marketId = nextMarketId;
      newMarket.question = marketQuestion;
      newMarket.optionName = optionName;
      // --- Add the other fields ---
      // Initialize marketParams if it doesn't exist (TypeORM should handle this, but safety first)
      if (!newMarket.marketParams) {
        newMarket.marketParams = new MarketParams(); // Assuming MarketParams is the class name
      }
      newMarket.marketParams.claimStatement = claimStatement; // Save to embedded params
      // newMarket.salt = salt; // Remove saving salt
      newMarket.startTimestamp = parseInt(startTime, 10);
      newMarket.endTimestamp = parseInt(endTime, 10);
      newMarket.startingSqrtPriceX96 = startingSqrtPriceX96;
      newMarket.baseAssetMinPriceTick = parseInt(baseAssetMinPriceTick, 10);
      newMarket.baseAssetMaxPriceTick = parseInt(baseAssetMaxPriceTick, 10);
      // Initialize other fields as needed, or rely on defaults/null
      newMarket.poolAddress = null;
      newMarket.settlementPriceD18 = null;
      newMarket.settled = null;
      newMarket.minPriceD18 = null;
      newMarket.maxPriceD18 = null;

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
  }
);

export { router };
