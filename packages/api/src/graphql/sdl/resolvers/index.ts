/**
 * Resolver map for the SDL-first schema.
 *
 * Assembles the three slices into the `Resolvers<ApolloContext>` shape
 * `makeExecutableSchema` expects:
 *
 *  - Query root — every root field from queries/*.ts flattened into
 *    one map.
 *  - Per-type field resolvers — one entry per Prisma-backed GraphQL
 *    type that has relation fields requiring a custom resolver
 *    (Category, Condition, ConditionGroup, etc.).
 *
 * Scalar-only GraphQL types (Pick, Trade, ActivityItem,
 * …) don't need an entry here; graphql-js's default field resolver
 * reads the property off the parent directly, which is already what
 * every root resolver returns.
 */

import type { Resolvers } from '../__generated__/resolvers';

import { scalarResolvers } from './scalars';

import { Account } from './Account';
import { Attestation } from './Attestation';
import { AttestationScore } from './AttestationScore';
import { Category } from './Category';
import { Condition } from './Condition';
import { ConditionGroup } from './ConditionGroup';
import { Activity, ActivitySource } from './Activity';
import { ActivityItemsPage } from './ActivityItemsPage';
import { Forecast } from './Forecast';
import { LegacyPosition } from './LegacyPosition';
import { LegacyPrediction } from './LegacyPrediction';
import { LimitOrder } from './LimitOrder';
import { Pick } from './Pick';
import { PickConfiguration } from './PickConfiguration';
import { PositionsPage } from './PositionsPage';
import { Question, ConditionOrConditionGroup } from './Question';
import { User } from './User';

import { accountActivityPage, activityPage } from './queries/activityPage';
import { activity } from './queries/activity';
import { leaderboard } from './queries/leaderboard';
import { accountActivity } from './queries/deprecated/activity';
import {
  accountStats,
  accountStatsLeaderboardPage,
  accountStatsRank,
} from './queries/accountStats';
import {
  openInterestByCategory,
  openInterestByTimeToResolution,
  protocol,
  protocolStats,
  Protocol,
  vault,
  Vault,
  vaultByAddress,
  vaultStats,
} from './queries/analytics';
import {
  collateralBalance,
  collateralBalanceHistory,
  collateralTransfersConnection,
} from './queries/collateralBalance';
import { collateralTransfers } from './queries/deprecated/collateralBalance';
import { conditionsConnection } from './queries/conditions';
import {
  conditionGroup,
  conditionGroupsConnection,
} from './queries/conditionGroups';
import { questionsConnection } from './queries/questions';
import { conditions } from './queries/deprecated/conditions';
import { conditionGroups } from './queries/deprecated/conditionGroups';
import { questions } from './queries/deprecated/questions';
import {
  account,
  accountsConnection,
  categories,
  categoriesConnection,
  condition,
  forecastByUid,
  forecastsConnection,
  user,
} from './queries/crud';
import { attestations, users } from './queries/deprecated/crud';
import {
  claims,
  closes,
  pickConfiguration,
  pickConfigurationsConnection,
  positionsConnection,
  positionsPage,
  prediction,
  predictionByOnchainId,
  predictionsConnection,
} from './queries/escrow';
import {
  pickConfigurations,
  positions,
  positionCount,
  predictions,
  predictionCount,
} from './queries/deprecated/escrow';
import { accountAccuracyRank, accuracyLeaderboardPage } from './queries/score';
import { accountAccuracy, accountProfitRank } from './queries/deprecated/score';
import { popularTags } from './queries/tags';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
  protocolVolume,
} from './queries/timeSeries';
import { node, nodes } from './queries/node';
import { trade, tradeByHash, tradesConnection } from './queries/trade';
import { trades, tradeCount } from './queries/deprecated/trade';
import { accountTotalVolume } from './queries/volume';

export const resolvers: Resolvers = {
  ...scalarResolvers,
  Query: {
    // Relay polymorphic refetch
    node,
    nodes,
    activity,
    leaderboard,
    // Leaderboards / account scores
    accountAccuracy,
    accountAccuracyRank,
    accountProfitRank,
    accuracyLeaderboardPage,
    accountStatsLeaderboardPage,
    accountStatsRank,
    // Per-account stats time series (fat row)
    accountStats,
    // Activity + unified feeds
    accountActivity,
    accountActivityPage,
    activityPage,
    // Analytics
    openInterestByCategory,
    openInterestByTimeToResolution,
    protocol,
    protocolStats,
    vault,
    vaultByAddress,
    vaultStats,
    // Legacy per-metric time series (DEPRECATED — superseded by accountStats / accountStatsRank.volume / protocolStats).
    accountBalance,
    accountPnl,
    accountPredictionCount,
    accountVolume,
    accountTotalVolume,
    protocolVolume,
    // Collateral
    collateralBalance,
    collateralBalanceHistory,
    collateralTransfers,
    collateralTransfersConnection,
    // Conditions / questions
    conditions,
    conditionsConnection,
    questions,
    questionsConnection,
    // Escrow (predictions / positions / claims / closes / pick configs)
    claims,
    closes,
    pickConfiguration,
    pickConfigurations,
    pickConfigurationsConnection,
    positionCount,
    positions,
    positionsConnection,
    positionsPage,
    prediction,
    predictionByOnchainId,
    predictionCount,
    predictions,
    predictionsConnection,
    // Secondary market trades
    trade,
    tradeByHash,
    tradeCount,
    trades,
    tradesConnection,
    // Tags
    popularTags,
    // CRUD passthroughs
    account,
    accountsConnection,
    attestations,
    forecastByUid,
    forecastsConnection,
    categories,
    categoriesConnection,
    condition,
    conditionGroup,
    conditionGroups,
    conditionGroupsConnection,
    user,
    users,
  },
  Account,
  Activity,
  ActivitySource,
  ActivityItemsPage,
  Attestation,
  AttestationScore,
  Category,
  Condition,
  ConditionGroup,
  Forecast,
  LegacyPosition,
  LegacyPrediction,
  LimitOrder,
  Pick,
  PickConfiguration,
  PositionsPage,
  Question,
  ConditionOrConditionGroup,
  Protocol,
  User,
  Vault,
};
