import { registerEnumType, ObjectType, Field, Int } from 'type-graphql';

export enum TimeInterval {
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

registerEnumType(TimeInterval, {
  name: 'TimeInterval',
  description: 'Time interval for bucketing time-series data',
});

/** Maps the TypeGraphQL enum to Postgres date_trunc arguments. */
export const INTERVAL_TO_PG: Record<TimeInterval, string> = {
  [TimeInterval.HOUR]: 'hour',
  [TimeInterval.DAY]: 'day',
  [TimeInterval.WEEK]: 'week',
  [TimeInterval.MONTH]: 'month',
};

/** Maps the TypeGraphQL enum to Postgres generate_series step values. */
export const INTERVAL_TO_PG_STEP: Record<TimeInterval, string> = {
  [TimeInterval.HOUR]: '1 hour',
  [TimeInterval.DAY]: '1 day',
  [TimeInterval.WEEK]: '1 week',
  [TimeInterval.MONTH]: '1 month',
};

@ObjectType({
  description: 'Time-bucketed volume data point for charts',
})
export class VolumeDataPoint {
  @Field(() => Int, {
    description: 'Unix epoch timestamp (seconds) for the start of this bucket',
  })
  timestamp!: number;

  @Field(() => String, { description: 'Total volume in wei for this bucket' })
  volume!: string;
}

@ObjectType({
  description: 'Time-bucketed PnL data point with cumulative tracking',
})
export class PnlDataPoint {
  @Field(() => Int, {
    description: 'Unix epoch timestamp (seconds) for the start of this bucket',
  })
  timestamp!: number;

  @Field(() => String, { description: 'PnL for this bucket in wei' })
  pnl!: string;

  @Field(() => String, { description: 'Running cumulative PnL in wei' })
  cumulativePnl!: string;
}

@ObjectType({
  description:
    'Time-bucketed prediction count with outcome breakdown, bucketed by creation time',
})
export class PredictionCountDataPoint {
  @Field(() => Int, {
    description: 'Unix epoch timestamp (seconds) for the start of this bucket',
  })
  timestamp!: number;

  @Field(() => Int, {
    description: 'Total predictions created in this bucket',
  })
  total!: number;

  @Field(() => Int, { description: 'Predictions won in this bucket' })
  won!: number;

  @Field(() => Int, { description: 'Predictions lost in this bucket' })
  lost!: number;

  @Field(() => Int, {
    description: 'Predictions still pending in this bucket',
  })
  pending!: number;

  @Field(() => Int, {
    description: 'Predictions settled as non-decisive in this bucket',
  })
  nonDecisive!: number;
}

@ObjectType({
  description:
    'Time-bucketed balance snapshot showing deployed and claimable collateral',
})
export class BalanceDataPoint {
  @Field(() => Int, {
    description: 'Unix epoch timestamp (seconds) for the start of this bucket',
  })
  timestamp!: number;

  @Field(() => String, {
    description: 'Active collateral deployed in open positions (wei)',
  })
  deployedCollateral!: string;

  @Field(() => String, {
    description: 'Collateral available to claim from settled positions (wei)',
  })
  claimableCollateral!: string;
}
