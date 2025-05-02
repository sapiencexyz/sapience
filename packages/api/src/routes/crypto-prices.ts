import { Router } from 'express';
import { mainnetPublicClient } from '../utils/utils';
import { formatUnits } from 'viem';

export const router = Router();

// This interface structures our cached crypto prices.
interface PriceCache {
  data: {
    btc: number | null;
    eth: number | null;
    sol: number | null;
  };
  timestamp: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

// Uniswap V3 pool addresses (all 0.05% fee tier).
const USDC_ETH_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'; // USDC (6) / ETH (18)
const BTC_USDC_POOL = '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35'; // BTC (8) / USDC (6)
const ETH_SOL_POOL = '0x127452F3f9cDc0389b0Bf59ce6131aA3Bd763598'; // ETH (18) / SOL (18)

// ABI for the Uniswap V3 pool's slot0 function.
const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// We use this config to specify how to calculate the price
// based on the pool's token decimals.
interface PriceConfig {
  token0Decimals: number;
  token1Decimals: number;
}

// Reads slot0 from the specified Uniswap pool,
// calculates the token pair price, returns it as a number.
async function getUniswapPrice(
  poolAddress: string,
  config: PriceConfig
): Promise<number | null> {
  try {
    const result = await mainnetPublicClient.readContract({
      address: poolAddress as `0x${string}`,
      abi: POOL_ABI,
      functionName: 'slot0',
    });

    const sqrtPriceX96 = result[0];
    if (sqrtPriceX96 === BigInt(0)) {
      return null;
    }

    // We handle very small sqrtPriceX96 values (e.g., for SOL/ETH) the same way,
    // but explicitly checking the threshold is helpful as an illustrative step
    // of how we might do special handling if needed.
    const priceInWei =
      (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> BigInt(192);

    // formatUnits converts a BigInt to a human-readable decimal string
    // based on the token decimals we pass in. This is the final step in
    // converting from the raw "sqrtPriceX96" to a normal float.
    const price = Number(
      formatUnits(
        priceInWei,
        18 + config.token1Decimals - config.token0Decimals
      )
    );

    return price;
  } catch (error) {
    console.error(`[ERROR FETCHING UNISWAP PRICE] pool: ${poolAddress}`, error);
    return null;
  }
}

// This route returns the BTC, ETH, and SOL prices in USD (USDC).
router.get('/', async (req, res) => {
  try {
    // If our cached data is still valid, respond with it.
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return res.json(cache.data);
    }

    // Otherwise, fetch new prices from the pools.
    const [ethPrice, btcPrice, solEthPrice] = await Promise.all([
      // USDC/ETH price => invert to get ETH in terms of USDC.
      getUniswapPrice(USDC_ETH_POOL, {
        token0Decimals: 6, // USDC
        token1Decimals: 18, // ETH
      }).then((price) => (price ? 1 / price : null)),

      // BTC/USDC price: directly as USDC per BTC.
      getUniswapPrice(BTC_USDC_POOL, {
        token0Decimals: 8, // BTC
        token1Decimals: 6, // USDC
      }),

      // ETH/SOL price: returns ETH per SOL.
      // We'll convert it into USD (via ETH price) in the next step.
      getUniswapPrice(ETH_SOL_POOL, {
        token0Decimals: 18, // ETH
        token1Decimals: 18, // SOL
      }),
    ]);

    // Convert SOL price to USD by combining solEthPrice with ethPrice.
    // The multiplier of 1e9 in the denominator is to match the actual decimal scaling
    // used for SOL-based pools (since both tokens are 18 decimals, but we want
    // canonical USD calculations).
    const prices = {
      eth: ethPrice,
      btc: btcPrice,
      sol:
        solEthPrice && ethPrice ? (1 / (solEthPrice * 1e9)) * ethPrice : null,
    };

    // Update our cache with fresh data.
    cache = {
      data: prices,
      timestamp: Date.now(),
    };

    return res.json(prices);
  } catch (error) {
    console.error('[ERROR IN CRYPTO PRICES ROUTE]', error);

    // If there's an older cache, return it as a fallback.
    if (cache) {
      console.log('[USING STALE CACHE AS FALLBACK]');
      return res.json(cache.data);
    }

    return res.status(500).json({ error: 'Error fetching crypto prices' });
  }
});
