/**
 * Deprecated `conditionGroups(where:)` resolver — accepts Prisma-style
 * args and passes through. Replaced by `conditionGroupsPage(filters:)`.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { Prisma } from '../../../../../../generated/prisma';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import prisma from '../../../../../core/db';

const asPrismaArgs = <T>(value: unknown): T => value as T;

export const conditionGroups: NonNullable<
  QueryResolvers['conditionGroups']
> = async (_parent, { where, orderBy, cursor, take, skip, distinct }) => {
  logDeprecatedHit('conditionGroups');
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
