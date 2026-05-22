/**
 * Legacy time-series queries — every export below is `@deprecated`
 * (superseded by `accountStats` / `accountStatsRank` / `protocolStats`).
 * Kept live until the deprecation-telemetry window confirms no
 * remaining consumers; deletion happens in the final cleanup PR.
 *
 * Heavy lifting lives in `services/timeSeriesQueries.ts` (shared with
 * the deployed path); these resolvers are thin wrappers.
 *
 * Each hit emits `logDeprecatedHit(name)` so the cleanup PR can gate
 * deletion on per-resolver call-count telemetry.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  queryAccountVolume,
  queryAccountPnl,
  queryAccountBalance,
  queryProtocolVolume,
  queryAccountPredictionCount,
} from '../../../../services/timeSeriesQueries';
import { TimeInterval as HelperTimeInterval } from '../../../../services/timeSeriesTypes';
import { logDeprecatedHit } from '../../../../lib/deprecationTelemetry';

const toHelperInterval = (i: string): HelperTimeInterval =>
  i as HelperTimeInterval;

export const accountVolume: NonNullable<
  QueryResolvers['accountVolume']
> = async (_parent, { address, interval, from, to }) => {
  logDeprecatedHit('accountVolume');
  return queryAccountVolume(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
};

export const accountPnl: NonNullable<QueryResolvers['accountPnl']> = async (
  _parent,
  { address, interval, from, to }
) => {
  logDeprecatedHit('accountPnl');
  return queryAccountPnl(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
};

export const accountBalance: NonNullable<
  QueryResolvers['accountBalance']
> = async (_parent, { address, interval, from, to }) => {
  logDeprecatedHit('accountBalance');
  return queryAccountBalance(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
};

export const accountPredictionCount: NonNullable<
  QueryResolvers['accountPredictionCount']
> = async (_parent, { address, interval, from, to }) => {
  logDeprecatedHit('accountPredictionCount');
  return queryAccountPredictionCount(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
};

export const protocolVolume: NonNullable<
  QueryResolvers['protocolVolume']
> = async (_parent, { interval, from, to }) => {
  logDeprecatedHit('protocolVolume');
  return queryProtocolVolume(
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
};
