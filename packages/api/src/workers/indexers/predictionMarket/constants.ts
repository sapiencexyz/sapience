// ConditionResolved event ABI for type-safe decoding (full ABI imported from SDK for watching)
export const CONDITION_RESOLVED_EVENT_ABI = [
  {
    type: 'event',
    name: 'ConditionResolved',
    inputs: [
      { name: 'conditionId', type: 'bytes32', indexed: true },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
      { name: 'invalid', type: 'bool', indexed: false },
      { name: 'payoutDenominator', type: 'uint256', indexed: false },
      { name: 'noPayout', type: 'uint256', indexed: false },
      { name: 'yesPayout', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;

// PendingRequestProcessed event ABI for vault deposit/withdrawal tracking
export const PENDING_REQUEST_PROCESSED_ABI = [
  {
    type: 'event',
    name: 'PendingRequestProcessed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'direction', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'assets', type: 'uint256', indexed: false },
    ],
  },
] as const;

// PredictionMarket contract ABI for the events we want to index
export const PREDICTION_MARKET_ABI = [
  {
    type: 'event',
    name: 'MarketSubmittedToUMA',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'assertionId', type: 'bytes32', indexed: true },
      { name: 'asserter', type: 'address', indexed: false },
      { name: 'claim', type: 'bytes', indexed: false },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
      { name: 'assertedTruthfully', type: 'bool', indexed: false },
      { name: 'resolutionTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionMinted',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionBurned',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'makerWon', type: 'bool', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionConsolidated',
    inputs: [
      { name: 'makerNftTokenId', type: 'uint256', indexed: true },
      { name: 'takerNftTokenId', type: 'uint256', indexed: true },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderPlaced',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderFilled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
    ],
  },
] as const;

// TODO: Move all of this code to the existing event processing pipeline
export const BLOCK_BATCH_SIZE = 100;
