/**
 * Emit schema.graphql without a database connection.
 *
 * TypeGraphQL's buildSchema only inspects decorator metadata on resolver
 * classes — it never opens a DB connection. Config and Prisma are lazily
 * initialized, so importing resolvers doesn't trigger env validation or
 * client creation.
 *
 * Usage:  pnpm --filter @sapience/api run emit-schema
 */

import 'reflect-metadata';
import { buildSchema, type NonEmptyArray } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import {
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
} from '../graphql/resolvers';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const allResolvers: Function[] = [
  FindManyAttestationResolver,
  FindManyCategoryResolver,
  FindUniqueConditionResolver,
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,
  FindManyUserResolver,
  FindUniqueUserResolver,
  ...relationResolvers,
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
];

await buildSchema({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- type-graphql's buildSchema API requires NonEmptyArray<Function>
  resolvers: allResolvers as NonEmptyArray<Function>,
  validate: false,
  emitSchemaFile: true,
});

console.log('schema.graphql emitted');
process.exit(0);
