import { registerEnumType, ObjectType, Field, ArgsType } from 'type-graphql';

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

@ArgsType()
export class AccountTimeSeriesArgs {
  @Field(() => String)
  address!: string;

  @Field(() => TimeInterval)
  interval!: TimeInterval;

  @Field(() => Date, { nullable: true })
  from?: Date;

  @Field(() => Date, { nullable: true })
  to?: Date;
}

@ArgsType()
export class TimeSeriesArgs {
  @Field(() => TimeInterval)
  interval!: TimeInterval;

  @Field(() => Date, { nullable: true })
  from?: Date;

  @Field(() => Date, { nullable: true })
  to?: Date;
}

@ObjectType()
export class VolumeDataPoint {
  @Field(() => String)
  timestamp!: string;

  @Field(() => String)
  volume!: string;
}

@ObjectType()
export class PnlDataPoint {
  @Field(() => String)
  timestamp!: string;

  @Field(() => String)
  pnl!: string;

  @Field(() => String)
  cumulativePnl!: string;
}

@ObjectType()
export class BalanceDataPoint {
  @Field(() => String)
  timestamp!: string;

  @Field(() => String)
  deployedCollateral!: string;

  @Field(() => String)
  claimableCollateral!: string;
}
