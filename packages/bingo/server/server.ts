// Node entry: handler.ts behind node:http, plus static serving of the built
// Vite frontend (one service serves both halves on Railway/local). On
// Vercel, api/index.ts mounts the same handler and the platform serves the
// static build.

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { env } from './config.js';
import { fairnessCommitment, poolSecret } from './draw.js';
import { activePool, handleRequest } from './handler.js';
import { NETWORKS } from './network.js';
import { minterAddress } from './receipt.js';
import type { Hex } from 'viem';

for (const network of NETWORKS) {
  const pool = activePool(network);
  console.log(
    `[bingo-server] ${network}: pool=${pool.poolId} cutoff=${new Date(pool.cutoff * 1000).toISOString()} ` +
      `conditions=${pool.conditions.length} commitment=${fairnessCommitment(
        poolSecret(env.SERVER_SECRET as Hex, pool.poolId),
      )}`,
  );
}
// Same key → same smart-account address on both networks; one log line.
void minterAddress('main').then((a) =>
  console.log(
    `[receipt] minter smart account: ${a} — must be the contracts' minter`,
  ),
);

// ---------------------------------------------------------------------------
// Static frontend (the built Vite app)
// ---------------------------------------------------------------------------

const STATIC_DIR = resolve(env.STATIC_DIR);
const STATIC_AVAILABLE = existsSync(join(STATIC_DIR, 'index.html'));
if (!STATIC_AVAILABLE) {
  console.log(
    `[bingo-server] no frontend build at ${STATIC_DIR} — API-only mode ` +
      '(dev: run the Vite dev server, it proxies /api here)',
  );
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/** GET-only static serving with SPA fallback to index.html. */
function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  if (!STATIC_AVAILABLE || req.method !== 'GET') return false;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = normalize(join(STATIC_DIR, rel));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(STATIC_DIR, 'index.html');
  }
  const isIndex = file.endsWith('index.html');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    // Vite emits content-hashed asset names; only index.html must revalidate.
    'cache-control': isIndex
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
  return true;
}

createServer((req, res) => {
  handleRequest(req, res)
    .then((handled) => {
      if (handled) return;
      if (serveStatic(req, res)) return;
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    })
    .catch((e) => {
      // handleRequest maps its own errors; this only catches static-serving
      // failures.
      console.error('[bingo-server] error:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error' }));
      }
    });
}).listen(env.PORT, () => {
  console.log(`[bingo-server] listening on :${env.PORT}`);
});
