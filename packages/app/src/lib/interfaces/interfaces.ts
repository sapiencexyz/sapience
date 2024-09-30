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
export interface EpochParams {
  assertionLiveness: bigint;
  baseAssetMaxPriceTick: number;
  baseAssetMinPriceTick: number;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  priceUnit: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
}
export enum VolumeWindow {
  H = '1H',
  D = '1D',
  W = '1W',
  M = '1M',
  Y = '1Y',
}

export enum ChartType {
  PRICE = 'Price',
  VOLUME = 'Volume',
  // LIQUIDITY = 'Liquidity',
}

export interface VolumeChartData {
  startTimestamp: number;
  endTimestamp: number;
  volume: number;
}
