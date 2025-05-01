import { Router } from 'express';
import { marketRepository } from 'src/db';
import { Market } from 'src/models/Market';
import { z } from 'zod';
import { getProviderForChain } from '../utils/utils';
import { formatUnits, parseUnits } from 'viem';
import Foil from '@foil/protocol/deployments/Foil.json';

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
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    const currentPrice = await getCurrentPrice(
      market.marketGroup.chainId,
      market.marketGroup.address,
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
    maxIterations = 3,
  } = params;

  console.log('maxIterations', maxIterations);
  // 1- get the theoretical max size for the collateral (collateralAvailable / currentPrice)
  const currentPriceD18 = parseUnits(currentPrice.toString(), 18);
  const UNIT_D18 = parseUnits('1', 18);
  const theoreticalMaxPositionSize =
    (collateralAvailable * UNIT_D18) / currentPriceD18;

  let currentPriceLimit = currentPrice;
  if (priceLimit !== undefined) {
    currentPriceLimit = priceLimit;
  }

  let found = false;
  let currentIteration = 0;
  let currentPositionSize = theoreticalMaxPositionSize;
  let positionSize: bigint = BigInt(0);

  const client = getProviderForChain(parseInt(chainId));

  // 2- quote using contract `quoteCreateTraderPosition` and loop to find the max position size between current price and expected price. The quoter function will revert if the size is too large and will return the price after the trade.
  while (!found && currentIteration < maxIterations) {
    // get the quote using viem. Notice we need to use a static call here since the function is not a view function
    try {
      // Convert position size to the correct sign based on direction
      positionSize = isLong ? currentPositionSize : -currentPositionSize;

      console.log('positionSize', positionSize);
      const result = await client.simulateContract({
        address: marketAddress as `0x${string}`,
        abi: Foil.abi,
        functionName: 'quoteCreateTraderPosition',
        args: [BigInt(epochId), positionSize],
      });

      // Extract the fill price from the result
      const [requiredCollateral, , priceAfterTrade] = result.result as [
        bigint,
        bigint,
        bigint,
      ];

      // if the price after the trade is not defined, use the expected price (this can happen if the version of the contract doesn't support the priceAfterTrade)
      const priceAfterTradeDecimal = priceAfterTrade
        ? Number(formatUnits(priceAfterTrade, 18))
        : expectedPrice;

      // if the price after the trade is between the current price and the expected price, we found the max size
      if (
        requiredCollateral <= collateralAvailable &&
        isLong &&
        priceAfterTradeDecimal > currentPriceLimit &&
        priceAfterTradeDecimal <= expectedPrice
      ) {
        found = true;
      } else if (
        requiredCollateral <= collateralAvailable &&
        !isLong &&
        priceAfterTradeDecimal < currentPriceLimit &&
        priceAfterTradeDecimal >= expectedPrice
      ) {
        found = true;
      } else {
        // Adjust position size for next iteration
        currentPositionSize = currentPositionSize / 2n;
      }
    } catch (error) {
      console.error('Error in quoteCreateTraderPosition:', error);
      // If the quote fails, reduce the position size and try again
      // console.error('Error in quoteCreateTraderPosition:', currentPositionSize);
      currentPositionSize = currentPositionSize / 2n;
    }

    // prepare for next iteration
    currentIteration++;
  }

  if (!found) {
    return null;
  }

  return positionSize;
}

async function getMarket(
  chainId: string,
  marketAddress: string,
  marketId: string
): Promise<Market | null> {
  const market = await marketRepository.findOne({
    where: {
      marketGroup: {
        chainId: parseInt(chainId),
        address: marketAddress.toLowerCase(),
      },
      marketId: parseInt(marketId),
    },
    relations: ['marketGroup'],
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
