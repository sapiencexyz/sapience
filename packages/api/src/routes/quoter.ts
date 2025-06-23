import Foil from '@foil/protocol/deployments/Foil.json';
import { Router } from 'express';
import prisma from '../db';
import { formatUnits, parseUnits } from 'viem';
import { z } from 'zod';
import { getProviderForChain } from '../utils/utils';
import type { Prisma } from '../../generated/prisma';

const router = Router();
const MAX_ITERATIONS = 10;

// Validation schema for query parameters
const querySchema = z.object({
  expectedPrice: z.string().transform(Number),
  collateralAvailable: z.string().transform(BigInt),
  maxIterations: z.string().transform(Number).optional(),
  priceLimit: z.string().transform(Number).optional(),
});

// This route returns the max size for the available collateral
router.get('/:chainId/:marketAddress/:epochId/', async (req, res) => {
  try {
    const { chainId, marketAddress, epochId } = req.params;
    const query = querySchema.parse(req.query);

    if (query.maxIterations === undefined) {
      query.maxIterations = MAX_ITERATIONS;
    } else if (
      query.maxIterations < 1 ||
      query.maxIterations > MAX_ITERATIONS
    ) {
      return res
        .status(400)
        .json({ error: 'maxIterations must be between 1 and 5' });
    }

    // Get the epoch data
    const market = await getMarket(chainId, marketAddress, epochId);
    if (!market || !market.market_group || !market.market_group.address) {
      return res.status(404).json({ error: 'Market not found' });
    }

    const currentPrice = await getCurrentPrice(
      market.market_group.chainId,
      market.market_group.address,
      market.marketId
    );
    if (!currentPrice) {
      return res.status(404).json({ error: 'Current price not found' });
    }

    const currentPriceDecimal = Number(formatUnits(currentPrice, 18));
    const expectedPriceDecimal = Number(query.expectedPrice);

    if (expectedPriceDecimal === 0) {
      return res
        .status(400)
        .json({ error: 'Expected price must be greater than 0' });
    }
    if (expectedPriceDecimal === currentPriceDecimal) {
      return res
        .status(400)
        .json({ error: 'Expected price must be different from current price' });
    }

    const collateralAvailable = query.collateralAvailable;

    // Determine if we should quote a LONG or SHORT based on price comparison
    const isLong = expectedPriceDecimal > currentPriceDecimal;

    const priceLimit: number =
      query.priceLimit !== undefined ? query.priceLimit : currentPriceDecimal;
    // Get the max size for the available collateral
    const maxSize = await getMaxSizeForCollateral({
      chainId,
      marketAddress,
      epochId,
      currentPrice: currentPriceDecimal,
      priceLimit,
      expectedPrice: expectedPriceDecimal,
      collateralAvailable,
      isLong,
      maxIterations: query.maxIterations,
    });

    if (maxSize === null) {
      return res.status(400).json({
        error:
          'Could not find a valid position size that satisfies the price constraints',
      });
    }

    return res.json({
      direction: isLong ? 'LONG' : 'SHORT',
      maxSize: maxSize.toString(),
      currentPrice: currentPriceDecimal.toString(),
      expectedPrice: expectedPriceDecimal.toString(),
      collateralAvailable: collateralAvailable.toString(),
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error in quoter endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Define an interface for the parameters
interface GetMaxSizeForCollateralParams {
  chainId: string;
  marketAddress: string;
  epochId: string;
  currentPrice: number;
  priceLimit?: number;
  expectedPrice: number;
  collateralAvailable: bigint;
  isLong: boolean;
  maxIterations?: number;
}

async function getMaxSizeForCollateral(
  params: GetMaxSizeForCollateralParams
): Promise<bigint | null> {
  const {
    chainId,
    marketAddress,
    epochId,
    currentPrice,
    priceLimit,
    expectedPrice,
    collateralAvailable,
    isLong,
    maxIterations = 10,
  } = params;

  console.log('Running binary search with maxIterations:', maxIterations);

  // Calculate theoretical max position size as initial upper bound
  const currentPriceD18 = parseUnits(currentPrice.toString(), 18);
  const UNIT_D18 = parseUnits('1', 18);
  const theoreticalMaxPositionSize =
    (collateralAvailable * UNIT_D18) / currentPriceD18;

  // Setup binary search parameters
  let minSize = BigInt(0);
  let maxSize = theoreticalMaxPositionSize;
  let viableSize: bigint | null = null;
  let viableCollateral: bigint | null = null;
  let viableFillPrice: bigint | null = null;

  const currentPriceLimit =
    priceLimit !== undefined ? priceLimit : currentPrice;
  const client = getProviderForChain(parseInt(chainId));

  console.log(
    `Starting binary search: minSize=${minSize}, maxSize=${maxSize}, isLong=${isLong}`
  );

  // Binary search for maximum viable size
  for (let attempt = 0; attempt < maxIterations; attempt++) {
    // Calculate midpoint between min and max
    const testSize = (maxSize + minSize) / BigInt(2);

    // Skip unnecessary iterations if we've converged
    if (maxSize - minSize < BigInt(10)) {
      console.log(`Binary search converged at iteration ${attempt}`);
      break;
    }

    // Convert to signed position size based on direction
    const signedTestSize = isLong ? testSize : -testSize;

    console.log(
      `Binary search iteration ${attempt}: Testing size ${signedTestSize}`
    );

    try {
      // Test this size with contract call
      const result = await client.simulateContract({
        address: marketAddress as `0x${string}`,
        abi: Foil.abi,
        functionName: 'quoteCreateTraderPosition',
        args: [BigInt(epochId), signedTestSize],
      });

      // Extract the relevant values from the result
      const [requiredCollateral, , priceAfterTrade] = result.result as [
        bigint,
        bigint,
        bigint,
      ];

      // Convert price to decimal for comparison
      const priceAfterTradeDecimal = priceAfterTrade
        ? Number(formatUnits(priceAfterTrade, 18))
        : expectedPrice;

      console.log(
        `Size ${signedTestSize} requires collateral ${requiredCollateral} vs available ${collateralAvailable}`
      );
      console.log(
        `Price after trade: ${priceAfterTradeDecimal}, expected: ${expectedPrice}, limit: ${currentPriceLimit}`
      );

      // Check if required collateral exceeds available
      if (requiredCollateral > collateralAvailable) {
        console.log(
          `Size ${signedTestSize} REJECTED (collateral ${requiredCollateral} exceeds available ${collateralAvailable})`
        );
        maxSize = testSize;
        continue;
      }

      // Check if price after trade is in acceptable range
      const isPriceAcceptable = isLong
        ? priceAfterTradeDecimal > currentPriceLimit &&
          priceAfterTradeDecimal <= expectedPrice
        : priceAfterTradeDecimal < currentPriceLimit &&
          priceAfterTradeDecimal >= expectedPrice;

      if (isPriceAcceptable) {
        // This size works, save it and try larger
        viableSize = signedTestSize;
        viableCollateral = requiredCollateral;
        viableFillPrice = priceAfterTrade;

        // Try a larger size next
        minSize = testSize;

        console.log(
          `Size ${signedTestSize} ACCEPTED, new min=${minSize}, max=${maxSize}`
        );
      } else {
        // Price not in acceptable range, try smaller size
        maxSize = testSize;
        console.log(
          `Size ${signedTestSize} REJECTED (price not in acceptable range), new min=${minSize}, max=${maxSize}`
        );
      }
    } catch (error) {
      // If error, size is too large
      console.error(`Size ${signedTestSize} REJECTED (error):`, error);
      maxSize = testSize;
    }
  }

  // Return the viable size if found
  if (viableSize !== null) {
    console.log(
      `Found maximum viable position size: ${viableSize} ` +
        `with required collateral: ${viableCollateral} ` +
        `and fill price: ${viableFillPrice}`
    );
    return viableSize;
  } else {
    console.error('Failed to find any viable position size');
    return null;
  }
}

async function getMarket(
  chainId: string,
  marketAddress: string,
  marketId: string
): Promise<Prisma.marketGetPayload<{
  include: { market_group: true };
}> | null> {
  const market = await prisma.market.findFirst({
    where: {
      market_group: {
        chainId: parseInt(chainId),
        address: marketAddress.toLowerCase(),
      },
      marketId: parseInt(marketId),
    },
    include: {
      market_group: true,
    },
  });
  return market;
}

// Use viem to get the current price
async function getCurrentPrice(
  chainId: number,
  marketAddress: string,
  epochId: number
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const price = await client.readContract({
    address: marketAddress as `0x${string}`,
    abi: Foil.abi,
    functionName: 'getReferencePrice',
    args: [BigInt(epochId)],
  });

  return price as bigint;
}

export { router };
