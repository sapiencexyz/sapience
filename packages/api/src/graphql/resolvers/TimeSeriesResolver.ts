import { Resolver, Query, Args, Directive } from 'type-graphql';
import {
  AccountTimeSeriesArgs,
  TimeSeriesArgs,
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
} from '../types/TimeSeriesTypes';
import {
  queryAccountVolumeHistory,
  queryAccountPnlHistory,
  queryAccountBalanceHistory,
  queryProtocolVolumeHistory,
} from '../../helpers/timeSeriesQueries';

@Resolver()
export class TimeSeriesResolver {
  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountVolumeHistory(
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryAccountVolumeHistory(address, interval, from, to);
  }

  @Query(() => [PnlDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountPnlHistory(
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<PnlDataPoint[]> {
    return queryAccountPnlHistory(address, interval, from, to);
  }

  @Query(() => [BalanceDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountBalanceHistory(
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<BalanceDataPoint[]> {
    return queryAccountBalanceHistory(address, interval, from, to);
  }

  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 120)')
  async protocolVolumeHistory(
    @Args() { interval, from, to }: TimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryProtocolVolumeHistory(interval, from, to);
  }
}
