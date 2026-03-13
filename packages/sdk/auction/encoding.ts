import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  type Hex,
} from 'viem';

// ============================================================================
// Polymarket Resolver Encoding (PredictedOutcome[])
// ============================================================================

export type PolymarketPredictedOutcome = {
  marketId: Hex; // bytes32
  prediction: boolean; // true = YES, false = NO
};

export function encodePolymarketPredictedOutcomes(
  outcomes: PolymarketPredictedOutcome[]
): Hex {
  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'marketId', type: 'bytes32' },
          { name: 'prediction', type: 'bool' },
        ],
      },
    ],
    [outcomes]
  );
}

// ============================================================================
// Pyth Resolver Encoding (PythResolver.BinaryOptionOutcome[])
// ============================================================================

export type PythBinaryOptionMarket = {
  priceId: Hex; // bytes32
  endTime: bigint; // uint64
  strikePrice: bigint; // int64
  strikeExpo: number; // int32
  overWinsOnTie: boolean;
};

export type PythBinaryOptionOutcome = PythBinaryOptionMarket & {
  prediction: boolean; // true = Over, false = Under
};

const PYTH_MARKET_ABI_PARAMS = [
  { type: 'bytes32' },
  { type: 'uint64' },
  { type: 'int64' },
  { type: 'int32' },
  { type: 'bool' },
] as const;

/**
 * Returns a decodable `conditionId` for a Pyth binary option market:
 * `abi.encode(priceId, endTime, strikePrice, strikeExpo, overWinsOnTie)`.
 *
 * This is a raw ABI encoding (no hash) so consumers can decode the fields.
 */
export function getPythMarketId(market: PythBinaryOptionMarket): Hex {
  return encodeAbiParameters(PYTH_MARKET_ABI_PARAMS, [
    market.priceId,
    market.endTime,
    market.strikePrice,
    market.strikeExpo,
    market.overWinsOnTie,
  ]);
}

/**
 * Returns the on-chain `marketId` used by `PythResolver.settlements`:
 * `keccak256(abi.encode(priceId, endTime, strikePrice, strikeExpo, overWinsOnTie))`.
 */
export function getPythMarketHash(market: PythBinaryOptionMarket): Hex {
  return keccak256(getPythMarketId(market));
}

/**
 * Decode a Pyth conditionId (raw ABI-encoded market params) back into fields.
 */
export function decodePythMarketId(
  conditionId: Hex
): PythBinaryOptionMarket | null {
  try {
    const [priceId, endTime, strikePrice, strikeExpo, overWinsOnTie] =
      decodeAbiParameters(PYTH_MARKET_ABI_PARAMS, conditionId);
    return {
      priceId: priceId as Hex,
      endTime,
      strikePrice,
      strikeExpo,
      overWinsOnTie,
    };
  } catch {
    return null;
  }
}

export function encodePythBinaryOptionOutcomes(
  outcomes: PythBinaryOptionOutcome[]
): Hex {
  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'priceId', type: 'bytes32' },
          { name: 'endTime', type: 'uint64' },
          { name: 'strikePrice', type: 'int64' },
          { name: 'strikeExpo', type: 'int32' },
          { name: 'overWinsOnTie', type: 'bool' },
          { name: 'prediction', type: 'bool' },
        ],
      },
    ],
    [outcomes]
  );
}

// ============================================================================
// Pyth Market Description Parsing
// ============================================================================

/**
 * Parse Pyth binary option market parameters from a condition description.
 *
 * Format: `PYTH_LAZER|priceId=0x...|endTime=...|strikePrice=...|strikeExpo=...|overWinsOnTie=...`
 *
 * Returns null if the description doesn't match the expected format.
 */
export function parsePythMarketFromDescription(
  description: string
): PythBinaryOptionMarket | null {
  if (!description.startsWith('PYTH_LAZER')) return null;

  const kv: Record<string, string> = {};
  for (const part of description.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) kv[part.slice(0, eq)] = part.slice(eq + 1);
  }

  if (!kv.priceId || !kv.endTime || !kv.strikePrice || !kv.strikeExpo)
    return null;

  const priceId = (
    kv.priceId.startsWith('0x') ? kv.priceId : `0x${kv.priceId}`
  ) as Hex;

  return {
    priceId,
    endTime: BigInt(kv.endTime),
    strikePrice: BigInt(kv.strikePrice),
    strikeExpo: Number(kv.strikeExpo),
    overWinsOnTie: kv.overWinsOnTie === '1',
  };
}

/**
 * Decode the Pyth Lazer feed ID (uint32) from a bytes32 priceId.
 * Returns null if the value is zero or exceeds uint32 range.
 */
export function decodePythLazerFeedId(priceId: Hex): number | null {
  try {
    const raw = BigInt(priceId);
    if (raw === 0n || raw > 0xffff_ffffn) return null;
    return Number(raw);
  } catch {
    return null;
  }
}
