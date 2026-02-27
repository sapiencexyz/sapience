import { Resolver, Query, Args, Directive } from 'type-graphql';
import {
  AccountTimeSeriesArgs,
  TimeSeriesArgs,
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
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryAccountVolume(address, interval, from, to);
  }

  @Query(() => [PnlDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountPnl(
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<PnlDataPoint[]> {
    return queryAccountPnl(address, interval, from, to);
  }

  @Query(() => [BalanceDataPoint])
  @Directive('@cacheControl(maxAge: 60)')
  async accountBalance(
    @Args() { address, interval, from, to }: AccountTimeSeriesArgs
  ): Promise<BalanceDataPoint[]> {
    return queryAccountBalance(address, interval, from, to);
  }

  @Query(() => [VolumeDataPoint])
  @Directive('@cacheControl(maxAge: 120)')
  async protocolVolume(
    @Args() { interval, from, to }: TimeSeriesArgs
  ): Promise<VolumeDataPoint[]> {
    return queryProtocolVolume(interval, from, to);
  }
}
