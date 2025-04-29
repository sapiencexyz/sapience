import { Router } from 'express';
import { getCryptoPrices } from '../performance/cachedCryptoPrices';
export const router = Router();

// This route returns the BTC, ETH, and SOL prices in USD (USDC).
router.get('/', async (req, res) => {
  try {
    const prices = await getCryptoPrices();
    return res.json(prices);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error fetching crypto prices' });
  }
});
