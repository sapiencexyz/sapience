/**
 * Time-series queries: per-account volume/PnL/balance/predictionCount
 * plus protocol-wide volume. All heavy lifting lives in
 * `helpers/timeSeriesQueries.ts` (shared with the deployed path);
 * these resolvers are thin wrappers.
 *
 * The existing helper module still imports its TimeInterval from the
 * type-graphql-decorated TimeSeriesTypes.ts. Codegen emits its own
 * TimeInterval enum with the same values — we cast across since the
 * TS-level enum identities differ but the runtime string values are
 * identical (`HOUR`/`DAY`/`WEEK`/`MONTH`). Once Phase 5 tears out the
 * type-graphql path, the two collapse.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  queryAccountVolume,
  queryAccountPnl,
  queryAccountBalance,
  queryProtocolVolume,
  queryAccountPredictionCount,
} from '../../../../helpers/timeSeriesQueries';
import { TimeInterval as HelperTimeInterval } from '../../../types/TimeSeriesTypes';

const toHelperInterval = (i: string): HelperTimeInterval =>
  i as HelperTimeInterval;

export const accountVolume: NonNullable<
  QueryResolvers['accountVolume']
> = async (_parent, { address, interval, from, to }) =>
  queryAccountVolume(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );

export const accountPnl: NonNullable<QueryResolvers['accountPnl']> = async (
  _parent,
  { address, interval, from, to }
) =>
  queryAccountPnl(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );

export const accountBalance: NonNullable<
  QueryResolvers['accountBalance']
> = async (_parent, { address, interval, from, to }) =>
  queryAccountBalance(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );

export const accountPredictionCount: NonNullable<
  QueryResolvers['accountPredictionCount']
> = async (_parent, { address, interval, from, to }) =>
  queryAccountPredictionCount(
    address,
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );

export const protocolVolume: NonNullable<
  QueryResolvers['protocolVolume']
> = async (_parent, { interval, from, to }) =>
  queryProtocolVolume(
    toHelperInterval(interval),
    from instanceof Date ? from : from ? new Date(from) : undefined,
    to instanceof Date ? to : to ? new Date(to) : undefined
  );
