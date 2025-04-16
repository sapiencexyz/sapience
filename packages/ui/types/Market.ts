import { Pool } from '@uniswap/v3-sdk';

export type Market = {
  epochId: string;
  startTime: bigint;
  endTime: bigint;
  poolAddress: `0x${string}`;
  ethToken: string;
  gasToken: string;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  pool: Pool;
  liquidity: string;
};
