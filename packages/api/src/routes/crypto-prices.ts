import { Router } from 'express';
import { cryptoPriceRepository } from '../db';
import { CryptoPrice } from '../models/CryptoPrice';
import { MoreThan, In } from 'typeorm';

export const router = Router();

// Define all supported crypto tickers
const TICKERS = ['btc', 'eth', 'sol', 'susds', 'wsteth'] as const;
type Ticker = (typeof TICKERS)[number];

// Map our tickers to CoinGecko IDs
const COINGECKO_ID_MAP: Record<Ticker, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  susds: 'susds',
  wsteth: 'wrapped-steth',
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Helper function to fetch prices from database
async function getDbPrices(
  useTimeCutoff = true
): Promise<Record<Ticker, number | null>> {
  const cutoffTime = useTimeCutoff
    ? new Date(Date.now() - CACHE_TTL)
    : new Date(0);

  const cachedPrices = await cryptoPriceRepository.find({
    where: {
      ticker: In(TICKERS),
      ...(useTimeCutoff && { timestamp: MoreThan(cutoffTime) }),
    },
    order: { timestamp: 'DESC' },
  });

  // Group by ticker and take the most recent price for each
  const priceMap: Record<string, number | null> = {};

  // Initialize with null values
  TICKERS.forEach((ticker) => {
    priceMap[ticker] = null;
  });

  // Fill in available prices
  for (const price of cachedPrices) {
    // Ensure price.ticker is a valid ticker before using it as an index
    if (
      price.ticker &&
      TICKERS.includes(price.ticker as Ticker) &&
      priceMap[price.ticker] === null
    ) {
      priceMap[price.ticker] = price.price;
    }
  }

  return priceMap as Record<Ticker, number | null>;
}

// Function to fetch prices from CoinGecko API
async function getCoinGeckoPrices(): Promise<Record<Ticker, number | null>> {
  const ids = Object.values(COINGECKO_ID_MAP).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `CoinGecko API responded with status: ${response.status}`
      );
    }
    const data = await response.json();

    // Initialize result with null values
    const result: Record<string, number | null> = {};
    TICKERS.forEach((ticker) => {
      result[ticker] = null;
    });

    // Fill in available prices
    for (const [ticker, coingeckoId] of Object.entries(COINGECKO_ID_MAP)) {
      if (data[coingeckoId]?.usd) {
        result[ticker] = data[coingeckoId].usd;
      }
    }

    return result;
  } catch (error) {
    console.error('[ERROR FETCHING COINGECKO PRICE]', error);
    return Object.fromEntries(
      TICKERS.map((ticker) => [ticker, null])
    ) as Record<Ticker, number | null>;
  }
}

// Check if all prices are available
function hasMissingPrices(prices: Record<Ticker, number | null>): boolean {
  return TICKERS.some((ticker) => prices[ticker] === null);
}

// This route returns the BTC, ETH, SOL, sUSDS, and wstETH prices in USD.
router.get('/', async (req, res) => {
  try {
    // 1. Try getting prices from cache first
    const cachedPrices = await getDbPrices(true);

    // If we have all prices cached and they are recent enough, return them
    if (!hasMissingPrices(cachedPrices)) {
      console.log('[USING DB CACHE]');
      return res.json(cachedPrices);
    }

    // 2. Fetch fresh prices from CoinGecko if cache is incomplete or expired
    console.log('[FETCHING FRESH PRICES FROM COINGECKO]');
    const freshPrices = await getCoinGeckoPrices();

    // 3. If fetch failed completely, try using stale cache
    if (TICKERS.every((ticker) => freshPrices[ticker] === null)) {
      if (!TICKERS.every((ticker) => cachedPrices[ticker] === null)) {
        console.log('[COINGECKO FETCH FAILED, USING STALE DB CACHE]');
        return res.json(cachedPrices);
      }
      throw new Error(
        'Failed to fetch prices from CoinGecko and no cache available.'
      );
    }

    // 4. Combine fresh and cached prices, prioritizing fresh ones
    const finalPrices: Record<string, number | null> = {};
    TICKERS.forEach((ticker) => {
      finalPrices[ticker] = freshPrices[ticker] ?? cachedPrices[ticker];
    });

    // 5. Update DB with fresh prices (only those successfully fetched)
    const pricesToSave: Partial<CryptoPrice>[] = [];
    TICKERS.forEach((ticker) => {
      if (freshPrices[ticker] !== null) {
        pricesToSave.push({ ticker, price: freshPrices[ticker] });
      }
    });

    if (pricesToSave.length > 0) {
      // Perform save operation asynchronously but don't wait for it to return response
      cryptoPriceRepository
        .save(pricesToSave)
        .then(() => {
          console.log('[DB CACHE UPDATED]');
        })
        .catch((dbError) => {
          console.error('[ERROR UPDATING DB CACHE]', dbError);
        });
    }

    return res.json(finalPrices);
  } catch (error) {
    console.error('[ERROR IN CRYPTO PRICES ROUTE]', error);

    // Fallback: Try to fetch any prices from DB regardless of timestamp
    try {
      const stalePrices = await getDbPrices(false);

      if (!TICKERS.every((ticker) => stalePrices[ticker] === null)) {
        console.log('[USING STALE DB CACHE AS FALLBACK]');
        return res.json(stalePrices);
      }
    } catch (dbError) {
      console.error('[ERROR FETCHING STALE DB CACHE]', dbError);
    }

    return res.status(500).json({ error: 'Error fetching crypto prices' });
  }
});
