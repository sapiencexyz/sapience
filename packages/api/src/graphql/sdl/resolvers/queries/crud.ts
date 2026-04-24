/**
 * The 7 CRUD passthroughs that typegraphql-prisma auto-generated on
 * the deployed stack (FindMany for Attestation/Category/ConditionGroup/
 * User, FindUnique for Condition/ConditionGroup/User).
 *
 * SDL-first hand-rolls them; each accepts the full Prisma-style
 * where/orderBy/cursor/take/skip/distinct surface and passes through.
 * The generated codegen types for these args come from the SDL blocks
 * we seeded from the deployed schema (*WhereInput, *OrderByWithRelation
 * Input, *ScalarFieldEnum, etc.), so the wire contract stays byte-
 * identical for these queries.
 *
 * We don't list `conditions` here — it has a custom default-public
 * filter (resolvers/queries/conditions.ts).
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../db';

/**
 * The SDL input types mirror Prisma's exactly but graphql-codegen and
 * Prisma have slightly different TS shapes (Maybe<T> vs T | null,
 * optional vs required on the arg object, etc.). A structural cast
 * here is safe — the values themselves are correct shapes at runtime;
 * the TS types just don't overlap cleanly.
 */
const asPrismaArgs = <T>(value: unknown): T => value as T;

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
) =>
  prisma.category.findMany({
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

export const condition: NonNullable<QueryResolvers['condition']> = async (
  _parent,
  { where }
) =>
  prisma.condition.findUnique({
    where: asPrismaArgs<Prisma.ConditionWhereUniqueInput>(where),
  });

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { where }) =>
  prisma.conditionGroup.findUnique({
    where: asPrismaArgs<Prisma.ConditionGroupWhereUniqueInput>(where),
  });

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

export const user: NonNullable<QueryResolvers['user']> = async (
  _parent,
  { where }
) =>
  prisma.user.findUnique({
    where: asPrismaArgs<Prisma.UserWhereUniqueInput>(where),
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
