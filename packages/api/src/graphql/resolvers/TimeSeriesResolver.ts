import { Resolver, Query, Arg, Directive } from 'type-graphql';
import {
  TimeInterval,
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
  PredictionCountDataPoint,
  PredictionOutcomesDataPoint,
} from '../types/TimeSeriesTypes';
import {
  queryAccountVolume,
  queryAccountPnl,
  queryAccountBalance,
  queryProtocolVolume,
  queryAccountPredictionCount,
  queryAccountPredictionOutcomes,
} from '../../helpers/timeSeriesQueries';

@Resolver()
export class TimeSeriesResolver {
  @Query(() => [VolumeDataPoint], {
    description: 'Time-bucketed trading volume for a single address',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountVolume(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<VolumeDataPoint[]> {
    return queryAccountVolume(address, interval, from, to);
  }

  @Query(() => [PnlDataPoint], {
    description:
      'Time-bucketed profit and loss for a single address with cumulative tracking',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountPnl(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<PnlDataPoint[]> {
    return queryAccountPnl(address, interval, from, to);
  }

  @Query(() => [BalanceDataPoint], {
    description:
      'Time-bucketed balance snapshots for a single address showing deployed and claimable collateral',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountBalance(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<BalanceDataPoint[]> {
    return queryAccountBalance(address, interval, from, to);
  }

  @Query(() => [PredictionCountDataPoint], {
    description: 'Time-bucketed prediction count for a single address',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountPredictionCount(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<PredictionCountDataPoint[]> {
    return queryAccountPredictionCount(address, interval, from, to);
  }

  @Query(() => [PredictionOutcomesDataPoint], {
    description:
      'Time-bucketed prediction outcomes (won/lost/pending) for a single address',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountPredictionOutcomes(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<PredictionOutcomesDataPoint[]> {
    return queryAccountPredictionOutcomes(address, interval, from, to);
  }

  @Query(() => [VolumeDataPoint], {
    description: 'Time-bucketed total protocol trading volume across all users',
  })
  @Directive('@cacheControl(maxAge: 120)')
  async protocolVolume(
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<VolumeDataPoint[]> {
    return queryProtocolVolume(interval, from, to);
  }
}
