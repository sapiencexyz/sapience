import {
  encodeAbiParameters,
  keccak256,
  type Hex,
} from 'viem';

// ============================================================================
// UMA Resolver Encoding (PredictionMarketUmaResolver.PredictedOutcome[])
// ============================================================================

export type UmaPredictedOutcome = {
  marketId: Hex; // bytes32
  prediction: boolean; // true = YES, false = NO
};

export function encodeUmaPredictedOutcomes(outcomes: UmaPredictedOutcome[]): Hex {
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
 * Mirrors `PythResolver.getMarketId`:
 * `keccak256(abi.encode(priceId,endTime,strikePrice,strikeExpo,overWinsOnTie))`.
 *
 * See `PythResolver.sol` in protocol.
 */
export function getPythMarketId(market: PythBinaryOptionMarket): Hex {
  const encoded = encodeAbiParameters(
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
  return keccak256(encoded);
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


