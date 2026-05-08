/**
 * Deprecated CRUD passthroughs that exposed Prisma-style where/orderBy/
 * cursor/take/skip/distinct directly on the wire:
 *
 *   - attestations    → use `attestationsPage` (purpose-built filters)
 *   - categories      → use `categoriesPage`
 *   - conditionGroups → use `conditionGroupsPage`
 *   - users           → unused; will be removed
 *
 * `categories` shares the TtlCache with the live `categoriesPage`
 * resolver so a hot path through either form warms both.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { Prisma } from '../../../../../../generated/prisma';
import prisma from '../../../../../core/db';
import { asPrismaArgs, categoriesCache, CATEGORIES_CACHE_KEY } from '../crud';

export const attestations: NonNullable<QueryResolvers['attestations']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) =>
  prisma.attestation.findMany({
    where: asPrismaArgs<Prisma.AttestationWhereInput | undefined>(
      where ?? undefined
    ),
    orderBy: asPrismaArgs<
      Prisma.AttestationOrderByWithRelationInput[] | undefined
    >(orderBy ?? undefined),
    cursor: asPrismaArgs<Prisma.AttestationWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.AttestationScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });

export const categories: NonNullable<QueryResolvers['categories']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  const isNoArgsCall =
    where == null &&
    orderBy == null &&
    cursor == null &&
    take == null &&
    skip == null &&
    distinct == null;

  if (isNoArgsCall) {
    const cached = categoriesCache.get(CATEGORIES_CACHE_KEY);
    if (cached) return cached;
  }

  const result = await prisma.category.findMany({
    where: asPrismaArgs<Prisma.CategoryWhereInput | undefined>(
      where ?? undefined
    ),
    orderBy: asPrismaArgs<
      Prisma.CategoryOrderByWithRelationInput[] | undefined
    >(orderBy ?? undefined),
    cursor: asPrismaArgs<Prisma.CategoryWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.CategoryScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });

  if (isNoArgsCall) categoriesCache.set(CATEGORIES_CACHE_KEY, result);
  return result;
};

export const conditionGroups: NonNullable<
  QueryResolvers['conditionGroups']
> = async (_parent, { where, orderBy, cursor, take, skip, distinct }) =>
  prisma.conditionGroup.findMany({
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

export const users: NonNullable<QueryResolvers['users']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) =>
  prisma.user.findMany({
    where: asPrismaArgs<Prisma.UserWhereInput | undefined>(where ?? undefined),
    orderBy: asPrismaArgs<Prisma.UserOrderByWithRelationInput[] | undefined>(
      orderBy ?? undefined
    ),
    cursor: asPrismaArgs<Prisma.UserWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.UserScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });
