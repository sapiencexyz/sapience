import { Router } from 'express';
import { z } from 'zod';
import { createChallenge, verifyAndCreateToken } from '../websocket/chatAuth';

export const router = Router();

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
