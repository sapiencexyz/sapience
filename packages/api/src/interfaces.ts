import type { Abi, PublicClient } from 'viem';
import type { resource } from '../generated/prisma';

export enum EventType {
  LiquidityPositionCreated = 'LiquidityPositionCreated',
  LiquidityPositionIncreased = 'LiquidityPositionIncreased',
  LiquidityPositionDecreased = 'LiquidityPositionDecreased',
  LiquidityPositionClosed = 'LiquidityPositionClosed',
  TraderPositionCreated = 'TraderPositionCreated',
  TraderPositionModified = 'TraderPositionModified',
  Transfer = 'Transfer',
  MarketInitialized = 'MarketInitialized',
  MarketUpdated = 'MarketUpdated',
  EpochCreated = 'EpochCreated',
  EpochSettled = 'EpochSettled',
  PositionSettled = 'PositionSettled',
  PositionUpdated = 'PositionUpdated',
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
  tradeRatio: string;
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
  loanAmount0: string;
  loanAmount1: string;
  liquidity: string;
}

export interface LiquidityPositionClosedEventLog {
  positionId: string;
  kind: PositionKind;
  collectedAmount0: string;
  collectedAmount1: string;
}

export interface PositionSettledEventLog {
  positionId: string;
  withdrawableCollateral: string;
}

export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}

export interface MarketParams {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  claimStatement: string;
  uniswapPositionManager: string;
  uniswapQuoter: string;
  uniswapSwapRouter: string;
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

export interface MarketCreatedUpdatedEventLog {
  initialOwner?: string;
  uniswapPositionManager: string;
  collateralAsset?: string;
  uniswapSwapRouter: string;
  optimisticOracleV3: string;
  marketParams: MarketParams;
}

export interface EpochCreatedEventLog {
  epochId: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
}

export interface Deployment {
  address: string;
  abi: Abi;
  deployTimestamp: string;
  deployTxnBlockNumber: string;
}
export enum TimeWindow {
  D = '1D',
  W = '1W',
  M = '1M',
}

export enum EventTransactionType {
  Undefined,
  CreateLiquidityPosition,
  IncreaseLiquidityPosition,
  DecreaseLiquidityPosition,
  CloseLiquidityPosition,
  TransitionLiquidityToTrade,
  DepositCollateral,
  CreateTradePosition,
  ModifyTradePosition,
  CloseTradePosition,
}

export interface PositionUpdatedEventLog {
  sender: string;
  epochId: string;
  positionId: string;
  transactionType: EventTransactionType;
  deltaCollateral: string;
  collateralAmount: string;
  vEthAmount: string;
  vGasAmount: string;
  borrowedVEth: string;
  borrowedVGas: string;
}
export interface IResourcePriceIndexer {
  client?: PublicClient;
  indexBlockPriceFromTimestamp(
    resource: resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting?: boolean
  ): Promise<boolean>;
  indexBlocks(resource: resource, blocks: number[]): Promise<boolean>;
  watchBlocksForResource(resource: resource): Promise<void>;
}

export interface LogData {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: number;
  removed: boolean;
  topics: string[];
  transactionIndex: number;
}

export interface MarketInfo {
  marketChainId: number;
  deployment: {
    address: string;
    deployTxnBlockNumber?: string | number | null;
    deployTimestamp?: string | number | null;
  };
  resource: {
    id?: number | string;
    slug?: string;
    priceIndexer: {
      client?: PublicClient;
      indexBlocks: (
        resource: resource,
        blockNumbers: number[]
      ) => Promise<boolean>;
    } | null;
    [key: string]: unknown;
  };
  vaultAddress?: string;
  isYin?: boolean;
  isCumulative?: boolean;
}
