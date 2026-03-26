import { Request, Response, Router } from 'express';
import { createHash } from 'crypto';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import { CHAIN_ID_ARBITRUM, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import {
  computePickConfigId,
  predictTokenPair,
  getTokenFactoryAddress,
} from '@sapience/sdk';
import type { Address, Hex } from 'viem';
import { isPredictedYes } from '@sapience/sdk/types';
import prisma from '../db';

const router = Router();

// Token lists are public data — allow any origin so DeFi aggregators
// (e.g. CowSwap widget iframe) can fetch it.
router.use('/tokenlist.json', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

const CHAIN_ID = CHAIN_ID_ARBITRUM;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOKENS = 900;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_NAME_LENGTH = 100; // CowSwap / @uniswap/token-lists schema limit
const MAX_SYMBOL_LENGTH = 80; // CowSwap patches the default 20 → 80

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// CowSwap validates names and symbols against ^[^<>]+$ — use unicode equivalents
function sanitizeAngleBrackets(str: string): string {
  return str.replace(/</g, '‹').replace(/>/g, '›');
}

// CowSwap validates tags against ^[\w]+$ with max 10 chars
function sanitizeTag(str: string): string {
  return str.replace(/[^\w]/g, '').slice(0, 10);
}

// CT resolver address (deployed on Ethereal, used for pick encoding)
const CT_RESOLVER =
  conditionalTokensConditionResolver[CHAIN_ID_ETHEREAL].address.toLowerCase();

// Token factory for deterministic address prediction
const TOKEN_FACTORY = getTokenFactoryAddress(CHAIN_ID)!;

interface CachedResponse {
  body: string;
  etag: string;
  createdAt: number;
}

let cache: CachedResponse | null = null;

const TOKEN_LOGO_URI = 'https://sapience.xyz/favicon.ico';

interface TokenEntry {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags: string[];
  extensions: {
    conditionId: string;
    sapience: true;
  };
}

async function buildTokenList(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);

  // Fetch conditions matching /markets default view:
  // - public, unsettled, not dead (OI=0 + past endTime)
  // - sorted by openInterest DESC
  const conditions = await prisma.condition.findMany({
    where: {
      public: true,
      settled: false,
      NOT: { openInterest: '0', endTime: { lt: nowSec } },
    },
    select: {
      id: true,
      question: true,
      shortName: true,
      openInterest: true,
      category: { select: { name: true } },
    },
  });

  // Sort by openInterest DESC (mirrors /markets default sort)
  // openInterest is stored as a varchar, so we sort numerically in JS
  conditions.sort((a, b) => {
    const oiA = BigInt(a.openInterest);
    const oiB = BigInt(b.openInterest);
    if (oiB > oiA) return 1;
    if (oiB < oiA) return -1;
    return 0;
  });

  // Build token entries — for each condition, compute YES/NO token addresses
  const tokens: TokenEntry[] = [];
  const resolverAddress = CT_RESOLVER as Address;

  for (const cond of conditions) {
    for (const outcome of [0, 1] as const) {
      const outcomeLabel = isPredictedYes(outcome) ? 'Yes' : 'No';

      // Compute deterministic pickConfigId for this single-condition pick
      const pickConfigId = computePickConfigId([
        {
          conditionResolver: resolverAddress,
          conditionId: cond.id as Hex,
          predictedOutcome: outcome,
        },
      ]);

      // Predict token addresses via CREATE3 (no RPC call)
      const pair = predictTokenPair(pickConfigId, TOKEN_FACTORY);

      const name = `${cond.question} — ${outcomeLabel}`;
      const symbol = `${cond.shortName || cond.question}-${outcomeLabel}`;

      tokens.push({
        chainId: CHAIN_ID,
        address: pair.predictorToken,
        name: truncate(sanitizeAngleBrackets(name), MAX_NAME_LENGTH),
        symbol: truncate(sanitizeAngleBrackets(symbol), MAX_SYMBOL_LENGTH),
        decimals: 18,
        logoURI: TOKEN_LOGO_URI,
        tags: cond.category ? [sanitizeTag(cond.category.name)] : [],
        extensions: {
          conditionId: cond.id,
          sapience: true,
        },
      });

      // Safety cap
      if (tokens.length >= MAX_TOKENS) break;
    }
    if (tokens.length >= MAX_TOKENS) break;
  }

  const now = new Date();
  // Each version field must be < 65536 per @uniswap/token-lists schema.
  // Encode date as minor = MMDD, patch = token count.
  const dateMinor = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();

  const tokenList = {
    name: 'Sapience Tokens',
    logoURI: 'https://sapience.xyz/favicon.ico',
    timestamp: now.toISOString(),
    version: {
      major: 1,
      minor: dateMinor,
      patch: Math.min(tokens.length, 65535),
    },
    tokens,
  };

  let json = JSON.stringify(tokenList);

  // Response size cap
  if (Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES) {
    while (
      tokenList.tokens.length > 0 &&
      Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES
    ) {
      tokenList.tokens.splice(-Math.min(100, tokenList.tokens.length));
      json = JSON.stringify(tokenList);
    }
  }

  return json;
}

// GET /tokenlist.json
router.get('/tokenlist.json', async (_req: Request, res: Response) => {
  try {
    const ifNoneMatch = _req.headers['if-none-match'];

    // Check in-memory cache
    const now = Date.now();
    if (cache && now - cache.createdAt < CACHE_TTL_MS) {
      if (ifNoneMatch && ifNoneMatch === cache.etag) {
        res.status(304).end();
        return;
      }
      res.set('Content-Type', 'application/json');
      res.set('Cache-Control', 'public, max-age=300');
      res.set('ETag', cache.etag);
      res.send(cache.body);
      return;
    }

    // Build fresh response
    const body = await buildTokenList();
    const etag = `"${createHash('md5').update(body).digest('hex')}"`;

    cache = { body, etag, createdAt: now };

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('ETag', etag);
    res.send(body);
  } catch (error: unknown) {
    console.error('Error building token list:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

function resetCache() {
  cache = null;
}

export {
  router,
  buildTokenList,
  resetCache,
  CACHE_TTL_MS,
  MAX_TOKENS,
  MAX_RESPONSE_BYTES,
  MAX_NAME_LENGTH,
  MAX_SYMBOL_LENGTH,
  CT_RESOLVER,
};
