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
 * Scalar-only GraphQL types (Pick, Trade, ActivityItem, PnlDataPoint,
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
import { ReferralCode } from './ReferralCode';
import { User } from './User';

import { accountActivity } from './queries/activity';
import {
  openInterestByCategory,
  openInterestByTimeToResolution,
  protocolStats,
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
  prediction,
  predictionCount,
  predictions,
} from './queries/escrow';
import { accountProfitRank, profitLeaderboard } from './queries/pnl';
import { questions } from './queries/questions';
import {
  accountAccuracy,
  accountAccuracyRank,
  accuracyLeaderboard,
} from './queries/score';
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
    accountAccuracy,
    accountAccuracyRank,
    accuracyLeaderboard,
    accountProfitRank,
    profitLeaderboard,
    // Time series
    accountBalance,
    accountPnl,
    accountPredictionCount,
    accountVolume,
    protocolVolume,
    // Activity + unified feeds
    accountActivity,
    // Analytics
    openInterestByCategory,
    openInterestByTimeToResolution,
    protocolStats,
    // Collateral
    accountTotalVolume,
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
  ReferralCode,
  User,
};
