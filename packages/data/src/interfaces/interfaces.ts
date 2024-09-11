export enum EventType {
  LiquidityPositionCreated = "LiquidityPositionCreated",
  LiquidityPositionIncreased = "LiquidityPositionIncreased",
  LiquidityPositionDecreased = "LiquidityPositionDecreased",
  LiquidityPositionClosed = "LiquidityPositionClosed",
  TraderPositionCreated = "TraderPositionCreated",
  TraderPositionModified = "TraderPositionModified",
}

export interface TradePositionEventLog {
  epochId: string;
  positionId: string;
  collateralAmount: string;
  vEthAmount: string;
  vGasAmount: string;
  borrowedVEth: string;
  borrowedVGas: string;
  initialPrice: string;
  finalPrice: string;
}

export interface LiquidityPositionCreatedEventLog {
  positionId: string;
  collateralAmount: string;
  addedAmount0: string;
  addedAmount1: string;
  liquidity: string;
  lowerTick: number;
  upperTick: number;
}

export interface LiquidityPositionModifiedEventLog {
  positionId: string;
  collateralAmount: string;
  amount0: string;
  amount1: string;
  liquidity: string;
}

export interface LiquidityPositionClosedEventLog {
  positionId: string;
  kind: PositionKind;
  collectedAmount0: string;
  collectedAmount1: string;
}

export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}

export interface EpochParams {
  baseAssetMinPriceTick: string;
  baseAssetMaxPriceTick: string;
  feeRate: string;
  assertionLiveness: string;
  bondCurrency: string;
  bondAmount: string;
  priceUnit: string;
}

export interface MarketCreatedUpdatedEventLog {
  owner: string;
  uniswapPositionManager: string;
  collateralAsset?: string;
  uniswapSwapRouter: string;
  optimisticOracleV3: string;
  epochParams: EpochParams;
}

export interface EpochCreatedEventLog {
  epochId: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
}
