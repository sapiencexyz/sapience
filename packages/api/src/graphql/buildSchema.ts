import 'reflect-metadata';
import { buildSchema, type NonEmptyArray } from 'type-graphql';
import type { GraphQLSchema } from 'graphql';
import {
  relationResolvers,
  ConditionGroupRelationsResolver,
  ConditionRelationsResolver,
  FindManyAttestationResolver,
  FindManyCategoryResolver,
  FindUniqueConditionResolver,
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,
  FindManyUserResolver,
  FindUniqueUserResolver,
} from '@generated/type-graphql';
import {
  PnLResolver,
  ScoreResolver,
  EscrowResolver,
  AnalyticsResolver,
  ConditionResolver,
  VolumeResolver,
  QuestionsResolver,
  TradeResolver,
  TimeSeriesResolver,
  CollateralBalanceResolver,
  ConditionGroupConditionsResolver,
  ConditionFieldsResolver,
  ActivityResolver,
  TagsResolver,
} from './resolvers';

export interface BuildApiSchemaOptions {
  emitSchemaFile?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const queryResolvers: Function[] = [
  FindManyAttestationResolver,
  FindManyCategoryResolver,
  FindUniqueConditionResolver,
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,
  FindManyUserResolver,
  FindUniqueUserResolver,
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const replacedResolvers: Set<Function> = new Set([
  ConditionGroupRelationsResolver,
  ConditionRelationsResolver,
]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const customResolvers: Function[] = [
  PnLResolver,
  ScoreResolver,
  EscrowResolver,
  AnalyticsResolver,
  ConditionResolver,
  VolumeResolver,
  QuestionsResolver,
  TradeResolver,
  TimeSeriesResolver,
  CollateralBalanceResolver,
  ConditionGroupConditionsResolver,
  ConditionFieldsResolver,
  ActivityResolver,
  TagsResolver,
];

export const buildApiSchema = async (
  options: BuildApiSchemaOptions = {}
): Promise<GraphQLSchema> => {
  const filteredRelationResolvers = relationResolvers.filter(
    (r) => !replacedResolvers.has(r)
  );
  if (
    filteredRelationResolvers.length !==
    relationResolvers.length - replacedResolvers.size
  ) {
    throw new Error(
      'Failed to filter generated relation resolvers — check that ConditionGroupRelationsResolver and ConditionRelationsResolver are still exported from @generated/type-graphql'
    );
  }

  const allResolvers = queryResolvers
    .concat(filteredRelationResolvers)
    .concat(customResolvers);

  return buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- type-graphql's buildSchema API requires NonEmptyArray<Function>
    resolvers: allResolvers as NonEmptyArray<Function>,
    validate: false,
    emitSchemaFile: options.emitSchemaFile ?? false,
  });
};
