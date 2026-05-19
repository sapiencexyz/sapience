/**
 * `Query.conditionGroupsLegacy` — original bare `conditionGroups(where:)`
 * Prisma-style resolver, renamed to free the canonical `conditionGroups`
 * name for the Relay-shaped connection while honoring the doc's
 * one-release deprecation window.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { Prisma } from '../../../../../../generated/prisma';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import prisma from '../../../../../core/db';

const asPrismaArgs = <T>(value: unknown): T => value as T;

export const conditionGroupsLegacy: NonNullable<
  QueryResolvers['conditionGroupsLegacy']
> = async (_parent, { where, orderBy, cursor, take, skip, distinct }) => {
  logDeprecatedHit('conditionGroupsLegacy');
  return prisma.conditionGroup.findMany({
    where: asPrismaArgs<Prisma.ConditionGroupWhereInput | undefined>(
      where ?? undefined
    ),
    orderBy: asPrismaArgs<
      Prisma.ConditionGroupOrderByWithRelationInput[] | undefined
    >(orderBy ?? undefined),
    cursor: asPrismaArgs<Prisma.ConditionGroupWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.ConditionGroupScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });
};
