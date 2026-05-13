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
import { ReferralCode } from './ReferralCode';
import { User } from './User';

import { accountActivity } from './queries/activity';
import {
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
  conditionGroup,
  conditionGroups,
  user,
  users,
} from './queries/crud';
import {
  claims,
  closes,
  pickConfiguration,
  pickConfigurations,
  positionCount,
  positions,
  positionsPage,
  prediction,
  predictionCount,
  predictions,
} from './queries/escrow';
import { questions } from './queries/questions';
import { accountAccuracyRank, accuracyLeaderboardPage } from './queries/score';
import { referralCodes } from './queries/referrals';
import { popularTags } from './queries/tags';
import { trade, tradeCount, trades } from './queries/trade';

export const resolvers: Resolvers = {
  ...scalarResolvers,
  Query: {
    // Leaderboards / account scores
    accountAccuracyRank,
    accuracyLeaderboardPage,
    accountStatsLeaderboardPage,
    accountStatsRank,
    // Activity + unified feeds
    accountActivity,
    // Analytics
    openInterestByCategory,
    openInterestByTimeToResolution,
    protocolStats,
    vaultStats,
    // Collateral
    collateralBalance,
    collateralBalanceHistory,
    collateralTransfers,
    // Conditions / questions
    conditions,
    questions,
    // Escrow (predictions / positions / claims / closes / pick configs)
    claims,
    closes,
    pickConfiguration,
    pickConfigurations,
    positionCount,
    positions,
    positionsPage,
    prediction,
    predictionCount,
    predictions,
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
    user,
    users,
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
  ReferralCode,
  User,
};
