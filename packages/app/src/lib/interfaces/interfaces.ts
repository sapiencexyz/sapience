export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}
export interface FoilPosition {
  id: bigint; // nft id
  kind: PositionKind;
  epochId: bigint;
  // Accounting data (debt and deposited collateral)
  depositedCollateralAmount: bigint; // configured collateral
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  // Position data (owned tokens and position size)
  vEthAmount: bigint;
  vGasAmount: bigint;
  isSettled: boolean;
  uniswapPositionId: string;
  // currentTokenAmount: bigint;
}

export enum TransactionType {
  ADD_LIQUIDITY = 'addLiquidity',
  REMOVE_LIQUIDITY = 'removeLiquidity',
  LONG = 'long',
  SHORT = 'short',
}

// TODO: Share this interface with data package in monorepo
export interface MarketParams {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  claimStatement: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
}
export interface EpochData {
  epochId: string;
  startTime: bigint;
  endTime: bigint;
  pool: `0x${string}`;
  ethToken: string;
  gasToken: string;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
}

export enum TimeWindow {
  D = '1D',
  W = '1W',
  M = '1M',
}

export enum TimeInterval {
  I5M = '5m',
  I15M = '15m',
  I30M = '30m',
  I4H = '4h',
  I1D = '1d',
}

export enum ChartType {
  PRICE = 'Price',
  VOLUME = 'Volume',
  LIQUIDITY = 'Liquidity',
}

export interface VolumeChartData {
  startTimestamp: number;
  endTimestamp: number;
  volume: number;
}

export interface PriceChartData {
  startTimestamp: number;
  endTimestamp: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

export interface RenderJob {
  id: string;
  serviceId: string;
  startCommand: string;
  planId: string;
  status?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}
