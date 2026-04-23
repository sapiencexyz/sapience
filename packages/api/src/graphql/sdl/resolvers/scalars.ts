/**
 * Custom scalar resolvers for the three non-standard scalars in our
 * SDL: DateTimeISO, BigInt, Decimal.
 *
 * DateTimeISO and BigInt are provided verbatim by `graphql-scalars`
 * (same package typegraphql-prisma used under the hood, so the wire
 * format matches bit-for-bit). Decimal is a hand-rolled thin scalar
 * that round-trips via strings (Prisma hands us Decimal instances
 * whose `toString()` yields the canonical form).
 *
 * Registering these in the resolver map is what makes Date instances
 * serialize to ISO strings on the response — without it, the default
 * scalar pass-through leaves raw Date objects on the wire and JSON
 * stringification returns `{}` because Date.prototype has no
 * enumerable properties.
 */

import { GraphQLScalarType } from 'graphql';
import { DateTimeISOResolver, BigIntResolver } from 'graphql-scalars';
import { Prisma } from '../../../../generated/prisma';

export const Decimal = new GraphQLScalarType({
  name: 'Decimal',
  description:
    'Prisma.Decimal — round-tripped as a decimal string with arbitrary precision.',
  serialize: (value: unknown): string => {
    if (value instanceof Prisma.Decimal) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    throw new Error(
      `Decimal cannot serialize value of type ${typeof value}: ${value}`
    );
  },
  parseValue: (value: unknown): Prisma.Decimal => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`Decimal must be parsed from a string or number`);
    }
    return new Prisma.Decimal(value);
  },
  parseLiteral: (ast) => {
    if (
      ast.kind === 'StringValue' ||
      ast.kind === 'IntValue' ||
      ast.kind === 'FloatValue'
    ) {
      return new Prisma.Decimal(ast.value);
    }
    throw new Error(`Decimal must be a string, int, or float literal`);
  },
});

export const scalarResolvers = {
  DateTimeISO: DateTimeISOResolver,
  BigInt: BigIntResolver,
  Decimal,
};
