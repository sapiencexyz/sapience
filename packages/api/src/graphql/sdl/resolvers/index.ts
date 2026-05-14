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
import { LegacyPosition } from './LegacyPosition';
import { LegacyPrediction } from './LegacyPrediction';
import { LimitOrder } from './LimitOrder';
import { Pick } from './Pick';
import { PositionsPage } from './PositionsPage';
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
import { conditions } from './queries/conditions';
import {
  attestations,
  categories,
  condition,
  conditionGroups,
  user,
} from './queries/crud';
import {
  pickConfigurations,
  positionCount,
  positionsPage,
  prediction,
  predictionCount,
  predictions,
} from './queries/escrow';
import { positions } from './queries/deprecated/escrow';
import { questions } from './queries/questions';
import { accountAccuracyRank, accuracyLeaderboardPage } from './queries/score';
import { referralCodes } from './queries/referrals';
import { popularTags } from './queries/tags';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
} from './queries/timeSeries';
import { trade, trades } from './queries/trade';
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
    // Collateral
    collateralBalance,
    collateralBalanceHistory,
    collateralTransfers,
    // Conditions / questions
    conditions,
    questions,
    // Escrow (predictions / positions / pick configs)
    pickConfigurations,
    positionCount,
    positions,
    positionsPage,
    prediction,
    predictionCount,
    predictions,
    // Secondary market trades
    trade,
    trades,
    // Referrals
    referralCodes,
    // Tags
    popularTags,
    // CRUD passthroughs
    attestations,
    categories,
    condition,
    conditionGroups,
    user,
  },
  Attestation,
  AttestationScore,
  Category,
  Condition,
  ConditionGroup,
  LegacyPosition,
  LegacyPrediction,
  LimitOrder,
  Pick,
  PositionsPage,
  ReferralCode,
  User,
};
