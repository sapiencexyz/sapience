export type PythLazerSymbolRow = {
  pyth_lazer_id?: unknown;
  symbol?: unknown;
  description?: unknown;
};

export type PredictionMintedEvent = {
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  makerCollateral: bigint;
  takerCollateral: bigint;
  totalCollateral: bigint;
  refCode: string;
};

export interface PredictionBurnedEvent {
  maker: string;
  taker: string;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  makerWon: boolean;
  refCode: string;
}

export interface PredictionConsolidatedEvent {
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  refCode: string;
}

export interface OrderPlacedEvent {
  maker: string;
  orderId: bigint;
  encodedPredictedOutcomes: `0x${string}`;
  resolver: string;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

export interface OrderFilledEvent {
  orderId: bigint;
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

export interface OrderCancelledEvent {
  orderId: bigint;
  maker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
}

export interface MarketResolvedEvent {
  marketId: string;
  resolvedToYes: boolean;
  assertedTruthfully: boolean;
  resolutionTime: bigint;
}

export interface MarketSubmittedToUMAEvent {
  marketId: string;
  assertionId: string;
  asserter: string;
  claim: `0x${string}`;
  resolvedToYes: boolean;
}

export interface ConditionResolvedEvent {
  conditionId: string;
  resolvedToYes: boolean;
  invalid: boolean;
  payoutDenominator: bigint;
  noPayout: bigint;
  yesPayout: bigint;
  timestamp: bigint;
}

export interface PendingRequestProcessedEvent {
  user: string;
  direction: boolean; // true = deposit, false = withdrawal
  shares: bigint;
  assets: bigint;
}
