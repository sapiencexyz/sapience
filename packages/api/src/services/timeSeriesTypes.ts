/**
 * Plain-TS shared types for the time-series helpers. The SDL-first
 * resolver layer generates its own typed `TimeInterval` enum and data-
 * point types via graphql-codegen (see
 * `src/graphql/sdl/__generated__/resolvers.ts`), but the helper module
 * that hits the database stays SDL-agnostic — it needs just the enum
 * values and shape, not any runtime registration. This file keeps the
 * helper code from pulling in type-graphql decorators.
 */

export enum TimeInterval {
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

/** Maps the enum to Postgres date_trunc arguments. */
export const INTERVAL_TO_PG: Record<TimeInterval, string> = {
  [TimeInterval.HOUR]: 'hour',
  [TimeInterval.DAY]: 'day',
  [TimeInterval.WEEK]: 'week',
  [TimeInterval.MONTH]: 'month',
};

/** Maps the enum to Postgres generate_series step values. */
export const INTERVAL_TO_PG_STEP: Record<TimeInterval, string> = {
  [TimeInterval.HOUR]: '1 hour',
  [TimeInterval.DAY]: '1 day',
  [TimeInterval.WEEK]: '1 week',
  [TimeInterval.MONTH]: '1 month',
};

export interface VolumeDataPoint {
  timestamp: number;
  volume: string;
}

export interface PnlDataPoint {
  timestamp: number;
  pnl: string;
  cumulativePnl: string;
}

export interface BalanceDataPoint {
  timestamp: number;
  deployedCollateral: string;
  claimableCollateral: string;
}

export interface PredictionCountDataPoint {
  timestamp: number;
  won: number;
  lost: number;
  nonDecisive: number;
  pending: number;
  total: number;
}
