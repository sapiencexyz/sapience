/**
 * Resolver map for the SDL-first schema.
 *
 * Each model file exports its `XxxResolvers` slice (typed against the
 * SDL via graphql-codegen). This index assembles them into a single
 * `Resolvers<ApolloContext>` object for `makeExecutableSchema`.
 *
 * Query/Mutation root resolvers get wired in by Phases 3–4 under
 * `resolvers/queries/*.ts` and merged here.
 */

import type { Resolvers } from '../__generated__/resolvers';
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

export const resolvers: Resolvers = {
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
