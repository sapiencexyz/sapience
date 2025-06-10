import prisma from '../db';
import { Router } from 'express';
import { Request, Response } from 'express';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';
import { MarketParams } from '../models/MarketParams';
import { watchFactoryAddress } from '../workers/jobs/indexMarkets';
import { isValidWalletSignature } from '../middleware';

const router = Router();

// Define an interface for the market data structure
interface MarketDataPayload {
  marketQuestion: string;
  optionName?: string | null;
  startTime: string | number;
  endTime: string | number;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: string | number;
  baseAssetMaxPriceTick: string | number;
  claimStatement: string;
  rules?: string | null;
}

// Helper function to create a single market
async function createSingleMarket(
  marketData: MarketDataPayload,
  marketGroupId: number,
  marketIndex: number
) {
  const {
    marketQuestion,
    optionName,
    startTime,
    endTime,
    startingSqrtPriceX96,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    claimStatement,
    rules,
  } = marketData;

  // Validate required market fields
  if (
    !marketQuestion ||
    !claimStatement ||
    startTime === undefined ||
    endTime === undefined ||
    !startingSqrtPriceX96 ||
    baseAssetMinPriceTick === undefined ||
    baseAssetMaxPriceTick === undefined
  ) {
    throw new Error(`Missing required fields for market ${marketIndex + 1}`);
  }

  // Create market using Prisma
  const newMarket = await prisma.market.create({
    data: {
      marketId: marketIndex + 1,
      question: marketQuestion,
      optionName: optionName || null,
      rules: rules || null,
      marketParamsClaimstatement: claimStatement,
      startTimestamp: parseInt(String(startTime), 10),
      endTimestamp: parseInt(String(endTime), 10),
      startingSqrtPriceX96: startingSqrtPriceX96,
      baseAssetMinPriceTick: parseInt(String(baseAssetMinPriceTick), 10),
      baseAssetMaxPriceTick: parseInt(String(baseAssetMaxPriceTick), 10),
      poolAddress: null,
      settlementPriceD18: null,
      settled: null,
      minPriceD18: null,
      maxPriceD18: null,
      marketGroupId: marketGroupId,
    },
  });

  return newMarket;
}

// Handler for POST /create-market-group
router.post('/', async (req: Request, res: Response) => {
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
      signature,
      signatureTimestamp,
    } = req.body as { markets: MarketDataPayload[] } & Omit<
      Request['body'],
      'markets'
    >;

    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'staging';

    // Verify signature in production/staging environments
    if (isProduction) {
      if (!signature || !signatureTimestamp) {
        return res
          .status(400)
          .json({ message: 'Signature and timestamp required' });
      }

      // Authenticate the user
      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(signatureTimestamp)
      );
      if (!isAuthenticated) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

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
    const existingMarketGroup = await prisma.market_group.findFirst({
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
    const category = await prisma.category.findFirst({
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
      resource = await prisma.resource.findFirst({
        where: { id: resourceId },
      });
      if (!resource) {
        return res
          .status(404)
          .json({ message: `Resource with id ${resourceId} not found` });
      }
    }

    // Create market group using Prisma
    const savedMarketGroup = await prisma.market_group.create({
      data: {
        chainId: parseInt(chainId, 10),
        question: question,
        baseTokenName: baseTokenName,
        quoteTokenName: quoteTokenName,
        initializationNonce: nonce,
        categoryId: category.id,
        factoryAddress: factoryAddress.toLowerCase(),
        owner: owner,
        collateralAsset: collateralAsset,
        minTradeSize: minTradeSize,
        marketParamsFeerate: marketParams.feerate,
        marketParamsAssertionliveness: marketParams.assertionliveness,
        marketParamsBondcurrency: marketParams.bondcurrency,
        marketParamsBondamount: marketParams.bondamount,
        marketParamsClaimstatement: marketParams.claimstatement,
        marketParamsUniswappositionmanager: marketParams.uniswappositionmanager,
        marketParamsUniswapswaprouter: marketParams.uniswapswaprouter,
        marketParamsUniswapquoter: marketParams.uniswapquoter,
        marketParamsOptimisticoraclev3: marketParams.optimisticoraclev3,
        resourceId: resource ? resource.id : null,
        isCumulative: isCumulative !== undefined ? isCumulative : false,
      },
    });

    // Check for new factory address
    const existingFactoryAddresses = await prisma.market_group.findMany({
      where: {
        chainId: parseInt(chainId, 10),
        factoryAddress: factoryAddress.toLowerCase(),
      },
      select: {
        factoryAddress: true,
      },
      distinct: ['factoryAddress'],
    });

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
      try {
        const savedMarket = await createSingleMarket(
          market,
          savedMarketGroup.id,
          i
        );
        savedMarkets.push(savedMarket);
      } catch (error: unknown) {
        // If createSingleMarket throws an error, it includes the market index.
        // We can directly use that error message.
        let message = 'An unknown error occurred during market creation.';
        if (error instanceof Error) {
          message = error.message;
        }
        return res.status(400).json({
          message,
        });
      }
    }

    // Return the created market group and markets
    return res.status(201).json({
      marketGroup: savedMarketGroup,
      markets: savedMarkets,
    });
  } catch (error: unknown) {
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

// Handler for POST /market-groups/:marketGroupAddressParam/markets
router.post(
  '/:marketGroupAddressParam/markets',
  async (req: Request, res: Response) => {
    try {
      const { marketGroupAddressParam } = req.params;
      const {
        marketData, // This will contain all individual market fields
        signature,
        signatureTimestamp,
        chainId: bodyChainId, // chainId from request body
      } = req.body as { marketData: MarketDataPayload } & Omit<
        Request['body'],
        'marketData'
      >;

      const isProduction =
        process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging';

      // Verify signature in production/staging environments
      if (isProduction) {
        if (!signature || !signatureTimestamp) {
          return res
            .status(400)
            .json({ message: 'Signature and timestamp required' });
        }

        // Authenticate the user
        const isAuthenticated = await isValidWalletSignature(
          signature as `0x${string}`,
          Number(signatureTimestamp)
        );
        if (!isAuthenticated) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      // Validate required fields from body
      if (!marketData || typeof marketData !== 'object' || !bodyChainId) {
        return res
          .status(400)
          .json({ message: 'Missing required fields: marketData, chainId' });
      }

      const chainId = parseInt(bodyChainId, 10);

      // Find existing market group
      const marketGroup = await prisma.market_group.findFirst({
        where: {
          address: marketGroupAddressParam.toLowerCase(),
          chainId: chainId,
        },
        include: {
          market: true,
        },
      });

      if (!marketGroup) {
        return res.status(404).json({
          message: `Market group with address ${marketGroupAddressParam} and chainId ${chainId} not found`,
        });
      }

      const nextMarketIndex = marketGroup.market ? marketGroup.market.length : 0;

      try {
        const savedMarket = await createSingleMarket(
          marketData,
          marketGroup.id,
          nextMarketIndex // Use nextMarketIndex to determine the new market's ID
        );
        return res.status(201).json(savedMarket);
      } catch (error: unknown) {
        let message = 'Error creating market';
        if (error instanceof Error) {
          message = error.message;
        }
        return res.status(400).json({
          message,
        });
      }
    } catch (error: unknown) {
      console.error('Error adding market to group:', error);
      let errorMessage = 'Internal Server Error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      return res.status(500).json({ message: errorMessage });
    }
  }
);

export { router };
