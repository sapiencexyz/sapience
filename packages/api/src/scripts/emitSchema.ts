/**
 * Emit schema.graphql without a database connection.
 *
 * TypeGraphQL's buildSchema only inspects decorator metadata on resolver
 * classes — it never opens a DB connection.  The trick is setting a dummy
 * DATABASE_URL *before* any module tries to validate env vars.
 *
 * Usage:  pnpm --filter @sapience/api run emit-schema
 */

// Must come before any import that triggers config.ts / envalid
process.env.DATABASE_URL ??= 'postgresql://dummy:dummy@localhost:5432/dummy';

import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
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

const allResolvers = (
  [
    FindManyAttestationResolver,
    FindManyCategoryResolver,
    FindUniqueConditionResolver,
    FindManyConditionGroupResolver,
    FindUniqueConditionGroupResolver,
    FindManyUserResolver,
    FindUniqueUserResolver,
  ] as Function[]
)
  .concat(relationResolvers)
  .concat([
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
  ]);

await buildSchema({
  resolvers: allResolvers as any,
  validate: false,
  emitSchemaFile: true,
});

console.log('schema.graphql emitted');
process.exit(0);
