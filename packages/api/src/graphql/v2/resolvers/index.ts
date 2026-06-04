/**
 * Resolver map for the v2 schema.
 *
 * Per-entity field resolvers and their root queries are added here as
 * each phase lands (see ../PLAN.md). Scalar resolvers are projected
 * down from the shared v1 scalar map to the narrower set v2 declares.
 */

import { scalarResolvers } from './scalars';
import { node, nodes } from './queries/node';
import { Account } from './Account';
import { account, accounts } from './queries/account';
import { Vault } from './Vault';
import { vault, vaults } from './queries/vault';
import { Category } from './Category';
import { category, categories } from './queries/category';
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
import { Ranking } from './Ranking';
import { Protocol, protocol } from './Protocol';
import { QuestionItem, questions } from './queries/questions';
import { tags } from './queries/tags';

export const resolvers = {
  ...scalarResolvers,
  Account,
  Vault,
  Category,
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
  QuestionItem,
  Ranking,
  Protocol,
  Query: {
    node,
    nodes,
    account,
    accounts,
    vault,
    vaults,
    category,
    categories,
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
    questions,
    tags,
  },
};
