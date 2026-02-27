import { Resolver, Query, Args, Directive } from 'type-graphql';
import {
  UserTimeSeriesArgs,
  TimeSeriesArgs,
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
} from '../types/TimeSeriesTypes';
import {
  queryUserVolumeHistory,
  queryUserPnlHistory,
  queryUserBalanceHistory,
  queryProtocolVolumeHistory,
} from '../../helpers/timeSeriesQueries';

@Resolver()
export class TimeSeriesResolver {
  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async userVolumeHistory(
    @Args() { address, interval, from, to }: UserTimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryUserVolumeHistory(address, interval, from, to);
  }

  @Query(() => [PnlDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async userPnlHistory(
    @Args() { address, interval, from, to }: UserTimeSeriesArgs
  ): Promise<PnlDataPoint[]> {
    return queryUserPnlHistory(address, interval, from, to);
  }

  @Query(() => [BalanceDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async userBalanceHistory(
    @Args() { address, interval, from, to }: UserTimeSeriesArgs
  ): Promise<BalanceDataPoint[]> {
    return queryUserBalanceHistory(address, interval, from, to);
  }

  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 120)')
  async protocolVolumeHistory(
    @Args() { interval, from, to }: TimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryProtocolVolumeHistory(interval, from, to);
  }
}
