/**
 * Resolver map for the v2 schema.
 *
 * Per-entity field resolvers and their root queries are added here as
 * each phase lands (see ../PLAN.md). Scalar resolvers are projected
 * down from the shared v1 scalar map to the narrower set v2 declares.
 */

import { scalarResolvers } from '../../sdl/resolvers/scalars';
import { node, nodes } from './queries/node';
import { Account, ReferralCode } from './Account';
import { account, accounts } from './queries/account';
import { Vault } from './Vault';
import { vault, vaults } from './queries/vault';
import { Category } from './Category';
import { category, categories } from './queries/category';
import { Forecast } from './Forecast';
import { forecast, forecasts } from './queries/forecast';
import { Trade } from './Trade';
import { trade, trades } from './queries/trade';
import { Condition } from './Condition';
import { condition, conditions } from './queries/condition';
import { ConditionGroup } from './ConditionGroup';
import { conditionGroup, conditionGroups } from './queries/conditionGroup';
import { PickConfiguration, Pick } from './PickConfiguration';
import {
  pickConfiguration,
  pickConfigurations,
} from './queries/pickConfiguration';
import { Prediction } from './Prediction';
import { prediction, predictions } from './queries/prediction';
import { Position } from './Position';
import { position, positions } from './queries/position';
import { Claim, Close } from './ClaimClose';
import { claim, claims, close, closes } from './queries/claimClose';
import { CollateralTransfer } from './CollateralTransfer';
import {
  collateralTransfer,
  collateralTransfers,
} from './queries/collateralTransfer';
import { ActivityItem } from './Activity';
import { activity } from './queries/activity';
import { leaderboard } from './queries/leaderboard';
import { Protocol, protocol } from './Protocol';

// Project the shared scalar map down to the scalars actually declared in
// v2's SDL. `makeExecutableSchema` warns when the resolver map mentions
// types the schema doesn't define, and v2 starts with a narrower scalar
// set than v1.
const { Address, BigInt, Bytes32, DateTimeISO, UnixSeconds } = scalarResolvers;

export const resolvers = {
  Address,
  BigInt,
  Bytes32,
  DateTimeISO,
  UnixSeconds,
  Account,
  ReferralCode,
  Vault,
  Category,
  Forecast,
  Trade,
  Condition,
  ConditionGroup,
  PickConfiguration,
  Pick,
  Prediction,
  Position,
  Claim,
  Close,
  CollateralTransfer,
  ActivityItem,
  Protocol,
  Query: {
    node,
    nodes,
    _v2Health: () => ({
      status: 'ok',
      schemaVersion: 'v2.0.0-stub',
    }),
    account,
    accounts,
    vault,
    vaults,
    category,
    categories,
    forecast,
    forecasts,
    trade,
    trades,
    condition,
    conditions,
    conditionGroup,
    conditionGroups,
    pickConfiguration,
    pickConfigurations,
    prediction,
    predictions,
    position,
    positions,
    claim,
    claims,
    close,
    closes,
    collateralTransfer,
    collateralTransfers,
    activity,
    leaderboard,
    protocol,
  },
};
