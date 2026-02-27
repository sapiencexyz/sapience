import { Resolver, Query, Arg, Directive } from 'type-graphql';
import {
  TimeInterval,
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
} from '../types/TimeSeriesTypes';
import {
  queryAccountVolume,
  queryAccountPnl,
  queryAccountBalance,
  queryProtocolVolume,
} from '../../helpers/timeSeriesQueries';

@Resolver()
export class TimeSeriesResolver {
  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountVolume(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<VolumeDataPoint[]> {
    return queryAccountVolume(address, interval, from, to);
  }

  @Query(() => [PnlDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountPnl(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<PnlDataPoint[]> {
    return queryAccountPnl(address, interval, from, to);
  }

  @Query(() => [BalanceDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountBalance(
    @Arg('address', () => String) address: string,
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<BalanceDataPoint[]> {
    return queryAccountBalance(address, interval, from, to);
  }

  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 120)')
  async protocolVolume(
    @Arg('interval', () => TimeInterval) interval: TimeInterval,
    @Arg('from', () => Date, { nullable: true }) from?: Date,
    @Arg('to', () => Date, { nullable: true }) to?: Date
  ): Promise<VolumeDataPoint[]> {
    return queryProtocolVolume(interval, from, to);
  }
}
