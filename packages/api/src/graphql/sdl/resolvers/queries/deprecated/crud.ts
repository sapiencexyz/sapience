/**
 * Deprecated typegraphql-prisma-style CRUD findMany passthroughs:
 *
 *   - attestations — replaced by `forecastsConnection` (Relay cursor connection)
 *   - users        — no longer used by any in-tree consumer; kept until
 *     deprecation telemetry shows zero external callers.
 *
 * `categories` stays in the live `../crud.ts` file because it shares the
 * `categoriesCache` TtlCache with the live `categoriesPage` resolver — it
 * just calls `logDeprecatedHit('categories')` from there.
 *
 * Each wrapper here emits a `logDeprecatedHit` log line so the final
 * cleanup PR can gate deletion on call-count telemetry.
 */

import { Prisma } from '../../../../../../generated/prisma';
import type { QueryResolvers } from '../../../__generated__/resolvers';
import prisma from '../../../../../core/db';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';

const asPrismaArgs = <T>(value: unknown): T => value as T;

export const attestations: NonNullable<QueryResolvers['attestations']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  logDeprecatedHit('attestations');
  return prisma.attestation.findMany({
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
};

export const users: NonNullable<QueryResolvers['users']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  logDeprecatedHit('users');
  return prisma.user.findMany({
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
};
