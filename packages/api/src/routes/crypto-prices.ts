import { Router } from 'express';
import { mainnetPublicClient } from '../utils';
import { formatUnits } from 'viem';

export const router = Router();

// Cache structure
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

// Uniswap V3 pool addresses (all 0.05% fee tier)
const USDC_ETH_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'; // USDC (6) / ETH (18)
const BTC_USDC_POOL = '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35'; // BTC (8) / USDC (6)
const ETH_SOL_POOL = '0x127452F3f9cDc0389b0Bf59ce6131aA3Bd763598'; // ETH (18) / SOL (18)

// ABI for slot0 function
const POOL_ABI = [{
  inputs: [],
  name: 'slot0',
  outputs: [
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'tick', type: 'int24' },
    { name: 'observationIndex', type: 'uint16' },
    { name: 'observationCardinality', type: 'uint16' },
    { name: 'observationCardinalityNext', type: 'uint16' },
    { name: 'feeProtocol', type: 'uint8' },
    { name: 'unlocked', type: 'bool' }
  ],
  stateMutability: 'view',
  type: 'function'
}] as const;

interface PriceConfig {
  token0Decimals: number;
  token1Decimals: number;
}

async function getUniswapPrice(poolAddress: string, config: PriceConfig): Promise<number | null> {
  try {
    const result = await mainnetPublicClient.readContract({
      address: poolAddress as `0x${string}`,
      abi: POOL_ABI,
      functionName: 'slot0'
    });

    const sqrtPriceX96 = result[0];
    if (sqrtPriceX96 === BigInt(0)) {
      return null;
    }

    console.log(`[DEBUG] Pool ${poolAddress}:`);
    console.log(`  sqrtPriceX96: ${sqrtPriceX96}`);

    // For very small numbers (like SOL/ETH), we need more precision
    let price: number;
    if (sqrtPriceX96 < BigInt(1e10)) {
      // Handle very small numbers (like SOL/ETH)
      const priceInWei = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> BigInt(192);
      price = Number(formatUnits(priceInWei, (18 + config.token1Decimals - config.token0Decimals)));
    } else {
      // Normal price calculation
      const priceInWei = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> BigInt(192);
      price = Number(formatUnits(priceInWei, (18 + config.token1Decimals - config.token0Decimals)));
    }
    
    console.log(`  final price: ${price}`);
    return price;
  } catch (error) {
    console.error(`[ERROR FETCHING UNISWAP PRICE] pool: ${poolAddress}`, error);
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    // Check if we have valid cached data
    if (cache && (Date.now() - cache.timestamp) < CACHE_TTL) {
      return res.json(cache.data);
    }

    // Fetch fresh data
    const [ethPrice, btcPrice, solEthPrice] = await Promise.all([
      // USDC/ETH price: price in USDC per ETH
      getUniswapPrice(USDC_ETH_POOL, {
        token0Decimals: 6,  // USDC
        token1Decimals: 18  // ETH
      }).then(price => price ? 1 / price : null),  // Invert to get ETH/USDC
      
      // BTC/USDC price: price in USDC per BTC
      getUniswapPrice(BTC_USDC_POOL, {
        token0Decimals: 8,  // BTC
        token1Decimals: 6   // USDC
      }),  // Remove the *100 multiplication
      
      // ETH/SOL price: price in ETH per SOL
      getUniswapPrice(ETH_SOL_POOL, {
        token0Decimals: 18, // ETH
        token1Decimals: 18  // SOL
      })  // Don't invert here, we'll handle it in the price calculation below
    ]);

    // Convert prices to USD
    const prices = {
      eth: ethPrice,                                    // Now in USD (USDC)
      btc: btcPrice,                                    // Now in USD (USDC)
      sol: solEthPrice && ethPrice ? (1 / (solEthPrice * 1e9)) * ethPrice : null  // Scale down by 1e6 to get correct SOL price
    };

    console.log('[CRYPTO PRICES]', prices);

    // Update cache
    cache = {
      data: prices,
      timestamp: Date.now()
    };

    return res.json(prices);
  } catch (error: any) {
    console.error('[ERROR IN CRYPTO PRICES ROUTE]', error);
    
    // If we have stale cache, return it as fallback
    if (cache) {
      console.log('[USING STALE CACHE AS FALLBACK]');
      return res.json(cache.data);
    }
    
    return res.status(500).json({ error: 'Error fetching crypto prices' });
  }
});