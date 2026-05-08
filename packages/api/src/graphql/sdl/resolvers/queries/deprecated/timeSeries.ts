/**
 * Deprecated `protocolVolume` query — unused; will be removed. The
 * live time-series resolvers (`accountVolume`, `accountPnl`,
 * `accountBalance`, `accountPredictionCount`) remain in the live file.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { queryProtocolVolume } from '../../../../../services/timeSeriesQueries';
import { TimeInterval as HelperTimeInterval } from '../../../../../services/timeSeriesTypes';

const toHelperInterval = (i: string): HelperTimeInterval =>
  i as HelperTimeInterval;

export const protocolVolume: NonNullable<
  QueryResolvers['protocolVolume']
> = async (_parent, { interval, from, to }) =>
  queryProtocolVolume(
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
