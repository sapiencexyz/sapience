// Vercel entry: every /api/* request is rewritten here (see vercel.json)
// and served by the same framework-free handler the node entry uses. The
// platform serves the static frontend build; this function is the backend.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRequest } from '../server/handler.js';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const handled = await handleRequest(req, res);
  if (!handled) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}
