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

export function encodePolymarketPredictedOutcomes(outcomes: PolymarketPredictedOutcome[]): Hex {
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

/**
 * Returns a decodable `conditionId` for a Pyth binary option market:
 * `abi.encode(priceId, endTime, strikePrice, strikeExpo, overWinsOnTie)`.
 *
 * This is a raw ABI encoding (no hash) so consumers can decode the fields.
 */
export function getPythMarketId(market: PythBinaryOptionMarket): Hex {
  return encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint64' },
      { type: 'int64' },
      { type: 'int32' },
      { type: 'bool' },
    ],
    [
      market.priceId,
      market.endTime,
      market.strikePrice,
      market.strikeExpo,
      market.overWinsOnTie,
    ]
  );
}

/**
 * Returns the on-chain `marketId` used by `PythResolver.settlements`:
 * `keccak256(abi.encode(priceId, endTime, strikePrice, strikeExpo, overWinsOnTie))`.
 */
export function getPythMarketHash(market: PythBinaryOptionMarket): Hex {
  return keccak256(getPythMarketId(market));
}

/**
 * Decode a `conditionId` produced by `getPythMarketId` back into its fields.
 */
export function decodePythMarketId(encoded: Hex): PythBinaryOptionMarket {
  const [priceId, endTime, strikePrice, strikeExpo, overWinsOnTie] =
    decodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint64' },
        { type: 'int64' },
        { type: 'int32' },
        { type: 'bool' },
      ],
      encoded
    );
  return {
    priceId,
    endTime,
    strikePrice: BigInt(strikePrice),
    strikeExpo: Number(strikeExpo),
    overWinsOnTie,
  };
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


