/**
 * Resolver map for the SDL-first schema.
 *
 * Assembles the three slices into the `Resolvers<ApolloContext>` shape
 * `makeExecutableSchema` expects:
 *
 *  - Query root — every root field from queries/*.ts flattened into
 *    one map. Deprecated query fields live in `queries/deprecated/`
 *    and are imported separately so they're easy to remove once
 *    consumers migrate off them.
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
import { Pick } from './Pick';
import { PositionsPage } from './PositionsPage';
import { PredictionsPage } from './PredictionsPage';
import { ReferralCode } from './ReferralCode';
import { User } from './User';

import { accountActivityPage } from './queries/activity';
import {
  openInterestByCategory,
  openInterestByTimeToResolution,
  protocolStats,
} from './queries/analytics';
import {
  collateralBalance,
  collateralBalanceHistory,
  collateralTransfersPage,
} from './queries/collateralBalance';
import { conditionGroup, conditionGroupsPage } from './queries/conditionGroups';
import { conditionsPage } from './queries/conditions';
import {
  attestationsPage,
  categoriesPage,
  condition,
  user,
} from './queries/crud';
import {
  pickConfigurationsPage,
  positionCount,
  positionsPage,
  prediction,
  predictionCount,
  predictionsPage,
} from './queries/escrow';
import { profitLeaderboardPage } from './queries/pnl';
import { questionsPage } from './queries/questions';
import { accountAccuracyRank, accuracyLeaderboardPage } from './queries/score';
import { referralCodesPage } from './queries/referrals';
import { popularTags } from './queries/tags';
import {
  accountBalance,
  accountPnl,
  accountPredictionCount,
  accountVolume,
} from './queries/timeSeries';
import { trade, tradesPage } from './queries/trade';
import { accountTotalVolume } from './queries/volume';

// Deprecated query resolvers — see `queries/deprecated/` for context.
// Grouped here so the call sites are obvious when it's time to delete
// them.
import { accountActivity } from './queries/deprecated/activity';
import { collateralTransfers } from './queries/deprecated/collateralBalance';
import { conditions } from './queries/deprecated/conditions';
import {
  attestations,
  categories,
  conditionGroups,
  users,
} from './queries/deprecated/crud';
import {
  claims,
  closes,
  pickConfiguration,
  pickConfigurations,
  positions,
  predictions,
} from './queries/deprecated/escrow';
import { accountProfitRank, profitLeaderboard } from './queries/deprecated/pnl';
import { questions } from './queries/deprecated/questions';
import {
  accountAccuracy,
  accuracyLeaderboard,
} from './queries/deprecated/score';
import { protocolVolume } from './queries/deprecated/timeSeries';
import { tradeCount, trades } from './queries/deprecated/trade';

export const resolvers: Resolvers = {
  ...scalarResolvers,
  Query: {
    // Leaderboards / account scores
    accountAccuracyRank,
    accuracyLeaderboardPage,
    profitLeaderboardPage,
    // Time series
    accountBalance,
    accountPnl,
    accountPredictionCount,
    accountVolume,
    // Activity + unified feeds
    accountActivityPage,
    // Analytics
    openInterestByCategory,
    openInterestByTimeToResolution,
    protocolStats,
    // Collateral
    accountTotalVolume,
    collateralBalance,
    collateralBalanceHistory,
    collateralTransfersPage,
    // Conditions / questions
    conditionGroup,
    conditionGroupsPage,
    conditionsPage,
    questionsPage,
    // Escrow (predictions / positions / pick configs)
    pickConfigurationsPage,
    positionCount,
    positionsPage,
    prediction,
    predictionCount,
    predictionsPage,
    // Secondary market trades
    trade,
    tradesPage,
    // Referrals
    referralCodesPage,
    // Tags
    popularTags,
    // CRUD
    attestationsPage,
    categoriesPage,
    condition,
    user,
    // Deprecated — migrate consumers, then delete
    accountAccuracy,
    accountActivity,
    accountProfitRank,
    accuracyLeaderboard,
    attestations,
    categories,
    claims,
    closes,
    collateralTransfers,
    conditionGroups,
    conditions,
    pickConfiguration,
    pickConfigurations,
    positions,
    predictions,
    profitLeaderboard,
    protocolVolume,
    questions,
    tradeCount,
    trades,
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
  PositionsPage,
  PredictionsPage,
  ReferralCode,
  User,
};
