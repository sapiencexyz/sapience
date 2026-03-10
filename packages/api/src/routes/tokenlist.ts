import { Request, Response, Router } from 'express';
import { createHash } from 'crypto';
import prisma from '../db';

const router = Router();

const CHAIN_IDS = [42161, 5064014]; // Arbitrum, Ethereal
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOKENS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

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
    resolved: boolean;
    result: string;
    sapience: true;
  };
}

function truncateName(name: string, suffix: string): string {
  const maxLen = 64;
  const full = `${name} ${suffix}`;
  if (full.length <= maxLen) return full;
  // Truncate name part to fit suffix
  const available = maxLen - suffix.length - 4; // 4 for "... "
  return `${name.slice(0, available)}... ${suffix}`;
}

async function buildTokenList(): Promise<string> {
  // Fetch pick configs with their picks
  const pickConfigs = await prisma.picks.findMany({
    where: {
      AND: [
        { predictorToken: { not: null } },
        { counterpartyToken: { not: null } },
      ],
    },
    include: {
      picks: {
        select: { conditionId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Collect all unique condition IDs
  const conditionIds = new Set<string>();
  for (const pc of pickConfigs) {
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

  for (const pc of pickConfigs) {
    // Build human-readable name from conditions
    const conditionNames = pc.picks
      .map((pick) => {
        const cond = conditionMap.get(pick.conditionId);
        if (!cond) return null;
        return cond.shortName || cond.question;
      })
      .filter(Boolean);

    const baseName =
      conditionNames.length > 0 ? conditionNames.join(' + ') : pc.id;

    // Extract first 4 bytes (8 hex chars) from pickConfigId after 0x prefix
    const hexSuffix = pc.id.startsWith('0x')
      ? pc.id.slice(2, 10)
      : pc.id.slice(0, 8);

    const sides: Array<{
      address: string;
      tag: string;
      prefix: string;
      suffix: string;
    }> = [
      {
        address: pc.predictorToken!,
        tag: 'predictor',
        prefix: 'PRD',
        suffix: '— Yes',
      },
      {
        address: pc.counterpartyToken!,
        tag: 'counterparty',
        prefix: 'CTR',
        suffix: '— No',
      },
    ];

    for (const side of sides) {
      const name = truncateName(baseName, side.suffix);
      const symbol = `${side.prefix}-${hexSuffix}`;

      for (const chainId of CHAIN_IDS) {
        tokens.push({
          chainId,
          address: side.address,
          name,
          symbol,
          decimals: 18,
          tags: [side.tag],
          extensions: {
            pickConfigId: pc.id,
            resolved: pc.resolved,
            result: pc.result,
            sapience: true,
          },
        });
      }
    }

    // Safety cap: stop if we've hit the limit
    if (tokens.length >= MAX_TOKENS) {
      tokens.length = MAX_TOKENS;
      break;
    }
  }

  const tokenList = {
    name: 'Sapience Position Tokens',
    logoURI: 'https://sapience.xyz/favicon.ico',
    timestamp: new Date().toISOString(),
    version: {
      major: 1,
      minor: 0,
      patch: tokens.length,
    },
    tokens,
  };

  let json = JSON.stringify(tokenList);

  // Response size cap: truncate token list if too large
  if (Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES) {
    while (
      tokenList.tokens.length > 0 &&
      Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES
    ) {
      // Remove last 100 tokens at a time for efficiency
      tokenList.tokens.splice(-Math.min(100, tokenList.tokens.length));
      tokenList.version.patch = tokenList.tokens.length;
      json = JSON.stringify(tokenList);
    }
  }

  return json;
}

// GET /tokenlist.json
router.get('/tokenlist.json', async (_req: Request, res: Response) => {
  try {
    // Check if client has a cached version
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

    // Update cache
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

export { router };
