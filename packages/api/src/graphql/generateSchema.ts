import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import only the query (read-only) resolvers from generated TypeGraphQL
import {
  AggregateCategoryResolver,
  FindFirstCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindManyCategoryResolver,
  FindUniqueCategoryResolver,
  FindUniqueCategoryOrThrowResolver,
  GroupByCategoryResolver,
  AggregateAttestationResolver,
  FindFirstAttestationResolver,
  FindFirstAttestationOrThrowResolver,
  FindManyAttestationResolver,
  FindUniqueAttestationResolver,
  FindUniqueAttestationOrThrowResolver,
  GroupByAttestationResolver,
  AggregateConditionResolver,
  FindFirstConditionOrThrowResolver,
  FindUniqueConditionResolver,
  FindUniqueConditionOrThrowResolver,
  GroupByConditionResolver,
  AggregateConditionGroupResolver,
  FindFirstConditionGroupResolver,
  FindFirstConditionGroupOrThrowResolver,
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,
  FindUniqueConditionGroupOrThrowResolver,
  GroupByConditionGroupResolver,
  AggregateUserResolver,
  FindFirstUserResolver,
  FindFirstUserOrThrowResolver,
  FindManyUserResolver,
  FindUniqueUserResolver,
  FindUniqueUserOrThrowResolver,
  GroupByUserResolver,
} from '@generated/type-graphql';

import {
  PnLResolver,
  ScoreResolver,
  PositionResolver,
  AnalyticsResolver,
  ConditionResolver,
} from './resolvers';

async function generateSchema() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const queryResolvers: Function[] = [
    AggregateCategoryResolver,
    FindFirstCategoryResolver,
    FindFirstCategoryOrThrowResolver,
    FindManyCategoryResolver,
    FindUniqueCategoryResolver,
    FindUniqueCategoryOrThrowResolver,
    GroupByCategoryResolver,
    AggregateAttestationResolver,
    FindFirstAttestationResolver,
    FindFirstAttestationOrThrowResolver,
    FindManyAttestationResolver,
    FindUniqueAttestationResolver,
    FindUniqueAttestationOrThrowResolver,
    GroupByAttestationResolver,
    AggregateConditionResolver,
    FindFirstConditionOrThrowResolver,
    FindUniqueConditionResolver,
    FindUniqueConditionOrThrowResolver,
    GroupByConditionResolver,
    AggregateConditionGroupResolver,
    FindFirstConditionGroupResolver,
    FindFirstConditionGroupOrThrowResolver,
    FindManyConditionGroupResolver,
    FindUniqueConditionGroupResolver,
    FindUniqueConditionGroupOrThrowResolver,
    GroupByConditionGroupResolver,
    AggregateUserResolver,
    FindFirstUserResolver,
    FindFirstUserOrThrowResolver,
    FindManyUserResolver,
    FindUniqueUserResolver,
    FindUniqueUserOrThrowResolver,
    GroupByUserResolver,
  ];

  const allResolvers = queryResolvers
    .concat(relationResolvers)
    .concat([
      PnLResolver,
      ScoreResolver,
      PositionResolver,
      AnalyticsResolver,
      ConditionResolver,
    ]);

  const schemaPath = path.resolve(__dirname, '../../schema.graphql');

  await buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvers: allResolvers as any,
    validate: false,
    emitSchemaFile: schemaPath,
  });

  console.log(`Schema generated at: ${schemaPath}`);
}

generateSchema().catch(console.error);
