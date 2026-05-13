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

import { Attestation } from './Attestation';
import { AttestationScore } from './AttestationScore';
import { Category } from './Category';
import { Condition } from './Condition';
import { ConditionGroup } from './ConditionGroup';
import { ConditionGroupsPage } from './ConditionGroupsPage';
import { ConditionsPage } from './ConditionsPage';
import { LegacyPosition } from './LegacyPosition';
import { LegacyPrediction } from './LegacyPrediction';
import { LimitOrder } from './LimitOrder';
import { Pick } from './Pick';
import { PickConfigurationsPage } from './PickConfigurationsPage';
import { PositionsPage } from './PositionsPage';
import { PredictionsPage } from './PredictionsPage';
import { QuestionsPage } from './QuestionsPage';
import { ReferralCode } from './ReferralCode';
import { User } from './User';

import { accountActivity } from './queries/activity';
import {
  accountStats,
  accountStatsLeaderboardPage,
  accountStatsRank,
} from './queries/accountStats';
import {
  openInterestByCategory,
  openInterestByTimeToResolution,
  protocolStats,
  vaultStats,
} from './queries/analytics';
import {
  collateralBalance,
  collateralBalanceHistory,
  collateralTransfers,
} from './queries/collateralBalance';
import { conditionsPage } from './queries/conditions';
import { conditionGroup, conditionGroupsPage } from './queries/conditionGroups';
import { questionsPage } from './queries/questions';
import { questions } from './queries/deprecated/questions';
import {
  attestations,
  categories,
  condition,
  user,
  users,
} from './queries/crud';
import { conditions } from './queries/deprecated/conditions';
import { conditionGroups } from './queries/deprecated/conditionGroups';
import {
  claims,
  closes,
  pickConfiguration,
  pickConfigurationsPage,
  positionCount,
  positionsPage,
  prediction,
  predictionCount,
  predictionsPage,
} from './queries/escrow';
import {
  pickConfigurations,
  positions,
  predictions,
} from './queries/deprecated/escrow';
import { accountAccuracyRank, accuracyLeaderboardPage } from './queries/score';
import { referralCodes } from './queries/referrals';
import { popularTags } from './queries/tags';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
  protocolVolume,
} from './queries/timeSeries';
import { trade, tradeCount, trades } from './queries/trade';
import { accountTotalVolume } from './queries/volume';

export const resolvers: Resolvers = {
  ...scalarResolvers,
  Query: {
    // Leaderboards / account scores
    accountAccuracyRank,
    accuracyLeaderboardPage,
    accountStatsLeaderboardPage,
    accountStatsRank,
    // Per-account stats time series (fat row)
    accountStats,
    // Activity + unified feeds
    accountActivity,
    // Analytics
    openInterestByCategory,
    openInterestByTimeToResolution,
    protocolStats,
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
    // Conditions / questions
    conditions,
    conditionsPage,
    questions,
    questionsPage,
    // Escrow (predictions / positions / claims / closes / pick configs)
    claims,
    closes,
    pickConfiguration,
    pickConfigurations,
    pickConfigurationsPage,
    positionCount,
    positions,
    positionsPage,
    prediction,
    predictionCount,
    predictions,
    predictionsPage,
    // Secondary market trades
    trade,
    tradeCount,
    trades,
    // Referrals
    referralCodes,
    // Tags
    popularTags,
    // CRUD passthroughs
    attestations,
    categories,
    condition,
    conditionGroup,
    conditionGroups,
    conditionGroupsPage,
    user,
    users,
  },
  Attestation,
  AttestationScore,
  Category,
  Condition,
  ConditionGroup,
  ConditionGroupsPage,
  ConditionsPage,
  LegacyPosition,
  LegacyPrediction,
  LimitOrder,
  Pick,
  PickConfigurationsPage,
  PositionsPage,
  PredictionsPage,
  QuestionsPage,
  ReferralCode,
  User,
};
