import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createChallenge, verifyAndCreateToken } from '../websocket/chatAuth';

export const router = Router();

// Basic in-memory IP rate limiter for this router
const RATE_LIMIT_WINDOW_MS = 10_000; // 10s window
const RATE_LIMIT_MAX_REQUESTS = 10; // allow 10 requests per 10s per IP
type RateEntry = { windowStart: number; count: number };
const rateMap = new Map<string, RateEntry>();

function getIp(req: Request): string {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const ip = xf.split(',')[0]?.trim();
  return ip || req.socket.remoteAddress || 'unknown';
}

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getIp(req);
    const now = Date.now();
    const existing = rateMap.get(ip);
    if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateMap.set(ip, { windowStart: now, count: 1 });
      return next();
    }
    existing.count += 1;
    if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    return next();
  } catch {
    // On failure, fail open but continue
    return next();
  }
}

router.use(rateLimitMiddleware);

router.get('/nonce', (req, res) => {
  try {
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const { nonce, message, expiresAt } = createChallenge(String(host));
    res.json({ nonce, message, expiresAt });
  } catch {
    res.status(500).json({ error: 'failed_to_create_nonce' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const schema = z.object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
      nonce: z.string().min(1),
    });
    const { address, signature, nonce } = schema.parse(req.body);
    const result = await verifyAndCreateToken({ address, signature, nonce });
    if (!result) {
      res.status(400).json({ error: 'invalid_signature' });
      return;
    }
    res.json(result);
  } catch {
    res.status(400).json({ error: 'invalid_request' });
  }
});

export default router;
