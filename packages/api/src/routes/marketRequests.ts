import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAddress } from 'viem';
import { createLogger } from '../core/logger';
import {
  hasMarketRequestWebhook,
  sendMarketRequestAlert,
  MAX_TICKER_LENGTH,
  MAX_NOTE_LENGTH,
} from '../services/marketRequestAlert';

const log = createLogger('routes.marketRequests');

const router = Router();

type MarketRequestBody = {
  ticker?: string;
  polymarketUrl?: string;
  note?: string;
  walletAddress?: string;
};

/** Accept polymarket.com (and its subdomains) links only. */
function normalizePolymarketUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'polymarket.com' && !host.endsWith('.polymarket.com')) {
    return null;
  }
  return parsed.toString();
}

// POST /market-requests - user requests a market/ticker that isn't listed yet
router.post('/', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as MarketRequestBody;

  const ticker = typeof body.ticker === 'string' ? body.ticker.trim() : '';
  if (!ticker) {
    return res.status(400).json({ message: 'ticker is required' });
  }
  if (ticker.length > MAX_TICKER_LENGTH) {
    return res
      .status(400)
      .json({ message: `ticker must be ${MAX_TICKER_LENGTH} chars or fewer` });
  }

  let polymarketUrl: string | null = null;
  if (typeof body.polymarketUrl === 'string' && body.polymarketUrl.trim()) {
    polymarketUrl = normalizePolymarketUrl(body.polymarketUrl);
    if (!polymarketUrl) {
      return res
        .status(400)
        .json({ message: 'polymarketUrl must be a valid polymarket.com link' });
    }
  }

  let note: string | null = null;
  if (typeof body.note === 'string' && body.note.trim()) {
    note = body.note.trim().slice(0, MAX_NOTE_LENGTH);
  }

  let walletAddress: string | null = null;
  if (typeof body.walletAddress === 'string' && body.walletAddress.trim()) {
    walletAddress = isAddress(body.walletAddress.trim())
      ? body.walletAddress.trim()
      : null;
  }

  if (!hasMarketRequestWebhook()) {
    // Not configured — accept silently so the client UX still works in dev.
    log.warn(
      '[marketRequests] No Discord webhook configured; dropping request'
    );
    return res.status(202).json({ delivered: false });
  }

  try {
    const delivered = sendMarketRequestAlert({
      ticker,
      polymarketUrl,
      note,
      walletAddress,
    });
    return res.status(202).json({ delivered });
  } catch (e) {
    log.error({ err: e }, 'Error sending market request alert');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };
