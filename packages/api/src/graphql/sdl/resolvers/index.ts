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
import { AttestationsPage } from './AttestationsPage';
import { CategoriesPage } from './CategoriesPage';
import { Category } from './Category';
import { Condition } from './Condition';
import { ConditionGroup } from './ConditionGroup';
import { ActivityItemsPage } from './ActivityItemsPage';
import { CollateralTransfersPage } from './CollateralTransfersPage';
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
import { ReferralCodeClaimantsPage } from './ReferralCodeClaimantsPage';
import { ReferralCodesPage } from './ReferralCodesPage';
import { TradesPage } from './TradesPage';
import { User } from './User';

import { accountActivityPage, activityPage } from './queries/activity';
import { accountActivity } from './queries/deprecated/activity';
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
  collateralTransfersPage,
} from './queries/collateralBalance';
import { collateralTransfers } from './queries/deprecated/collateralBalance';
import { conditionsPage } from './queries/conditions';
import { conditionGroup, conditionGroupsPage } from './queries/conditionGroups';
import { questionsPage } from './queries/questions';
import { questions } from './queries/deprecated/questions';
import {
  account,
  attestationsPage,
  categories,
  categoriesPage,
  condition,
  user,
} from './queries/crud';
import { attestations, users } from './queries/deprecated/crud';
import { conditions } from './queries/deprecated/conditions';
import { conditionGroups } from './queries/deprecated/conditionGroups';
import {
  claims,
  closes,
  pickConfiguration,
  pickConfigurationsPage,
  positionsPage,
  prediction,
  predictionsPage,
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
import { referralCodesPage } from './queries/referrals';
import { popularTags } from './queries/tags';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
  protocolVolume,
} from './queries/timeSeries';
import { trade, tradesPage } from './queries/trade';
import { trades, tradeCount } from './queries/deprecated/trade';
import { accountTotalVolume } from './queries/volume';

export const resolvers: Resolvers = {
  ...scalarResolvers,
  Query: {
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
    collateralTransfersPage,
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
    tradesPage,
    // Referrals
    referralCodesPage,
    // Tags
    popularTags,
    // CRUD passthroughs
    account,
    attestations,
    attestationsPage,
    categories,
    categoriesPage,
    condition,
    conditionGroup,
    conditionGroups,
    conditionGroupsPage,
    user,
    users,
  },
  Account,
  ActivityItemsPage,
  Attestation,
  AttestationScore,
  AttestationsPage,
  CategoriesPage,
  Category,
  CollateralTransfersPage,
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
  ReferralCodeClaimantsPage,
  ReferralCodesPage,
  TradesPage,
  User,
};
