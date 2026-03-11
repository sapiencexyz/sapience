import { Request, Response, Router } from 'express';
import { createHash } from 'crypto';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_ETHEREAL,
} from '@sapience/sdk/constants';
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

const CHAIN_IDS = [CHAIN_ID_ARBITRUM, CHAIN_ID_ETHEREAL];
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOKENS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_NAME_LENGTH = 100; // CowSwap / @uniswap/token-lists schema limit
const MAX_SYMBOL_LENGTH = 80; // CowSwap patches the default 20 → 80

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// Only include tokens using the ConditionalTokens resolver (Polymarket-style)
const CT_RESOLVER =
  conditionalTokensConditionResolver[CHAIN_ID_ETHEREAL].address.toLowerCase();

interface CachedResponse {
  body: string;
  etag: string;
  createdAt: number;
}

let cache: CachedResponse | null = null;

interface TokenEntry {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
  extensions: {
    pickConfigId: string;
    result: string;
    sapience: true;
  };
}

async function buildTokenList(): Promise<string> {
  // Fetch pick configs that use the CT resolver, with their picks
  const pickConfigs = await prisma.picks.findMany({
    where: {
      AND: [
        { predictorToken: { not: null } },
        { counterpartyToken: { not: null } },
      ],
    },
    include: {
      picks: {
        select: {
          conditionId: true,
          conditionResolver: true,
          predictedOutcome: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter to only configs where ALL picks use the CT resolver
  const ctConfigs = pickConfigs.filter((pc) =>
    pc.picks.every(
      (pick) => pick.conditionResolver.toLowerCase() === CT_RESOLVER
    )
  );

  // Collect all unique condition IDs
  const conditionIds = new Set<string>();
  for (const pc of ctConfigs) {
    for (const pick of pc.picks) {
      conditionIds.add(pick.conditionId);
    }
  }

  // Batch fetch conditions
  const conditions = await prisma.condition.findMany({
    where: { id: { in: Array.from(conditionIds) } },
    select: { id: true, question: true, shortName: true },
  });
  const conditionMap = new Map(conditions.map((c) => [c.id, c]));

  // Build token entries
  const tokens: TokenEntry[] = [];

  for (const pc of ctConfigs) {
    // Build names from conditions
    // For single-pick configs: use the condition directly
    // For multi-pick (parlay): join condition names
    const conditionParts: Array<{
      name: string;
      shortName: string;
      outcome: string;
    }> = [];

    for (const pick of pc.picks) {
      const cond = conditionMap.get(pick.conditionId);
      if (!cond) continue;
      // predictedOutcome: 0 = YES, 1 = NO
      const outcome = pick.predictedOutcome === 0 ? 'Yes' : 'No';
      conditionParts.push({
        name: cond.question,
        shortName: cond.shortName || cond.question,
        outcome,
      });
    }

    if (conditionParts.length === 0) continue;

    // Token name = condition question(s) with predicted outcome
    // e.g. "Will BTC hit 100k? — Yes" or "Will BTC hit 100k? — Yes + Will ETH hit 10k? — No"
    const predictorName =
      conditionParts.length === 1
        ? `${conditionParts[0].name} — ${conditionParts[0].outcome}`
        : conditionParts
            .map((p) => `${p.name} — ${p.outcome}`)
            .join(' + ');

    // Counterparty name = same but with (Counterparty) appended
    const counterpartyName =
      conditionParts.length === 1
        ? `${conditionParts[0].name} — ${conditionParts[0].outcome} (Counterparty)`
        : conditionParts
            .map((p) => `${p.name} — ${p.outcome}`)
            .join(' + ') + ' (Counterparty)';

    // Symbol = shortName-based with outcome
    // e.g. "BTC-100k-Yes" or "BTC-100k-Yes-counterparty"
    const predictorSymbol =
      conditionParts.length === 1
        ? `${conditionParts[0].shortName}-${conditionParts[0].outcome}`
        : conditionParts
            .map((p) => `${p.shortName}-${p.outcome}`)
            .join('+');

    const counterpartySymbol = `${predictorSymbol}-counterparty`;

    const sides: Array<{
      address: string;
      tag: string;
      name: string;
      symbol: string;
    }> = [
      {
        address: pc.predictorToken!,
        tag: 'predictor',
        name: predictorName,
        symbol: predictorSymbol,
      },
      {
        address: pc.counterpartyToken!,
        tag: 'counterparty',
        name: counterpartyName,
        symbol: counterpartySymbol,
      },
    ];

    for (const side of sides) {
      for (const chainId of CHAIN_IDS) {
        tokens.push({
          chainId,
          address: side.address,
          name: truncate(side.name, MAX_NAME_LENGTH),
          symbol: truncate(side.symbol, MAX_SYMBOL_LENGTH),
          decimals: 18,
          tags: [side.tag],
          extensions: {
            pickConfigId: pc.id,
            result: pc.result,
            sapience: true,
          },
        });
      }
    }

    // Safety cap
    if (tokens.length >= MAX_TOKENS) {
      tokens.length = MAX_TOKENS;
      break;
    }
  }

  const now = new Date();
  // Each version field must be < 65536 per @uniswap/token-lists schema.
  // Encode date as minor = MMDD, patch = token count.
  const dateMinor =
    (now.getUTCMonth() + 1) * 100 + now.getUTCDate();

  const tokenList = {
    name: 'Sapience Position Tokens',
    logoURI: 'https://sapience.xyz/favicon.ico',
    timestamp: now.toISOString(),
    version: {
      major: 1,
      minor: dateMinor,
      patch: tokens.length,
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

export { router, buildTokenList, resetCache, CACHE_TTL_MS, MAX_TOKENS, MAX_RESPONSE_BYTES, MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, CT_RESOLVER };
