/**
 * Custom scalar resolvers for the four non-standard scalars in our
 * SDL: DateTimeISO, BigInt, Decimal, UnixSeconds.
 *
 * DateTimeISO and BigInt are provided verbatim by `graphql-scalars`
 * (same package typegraphql-prisma used under the hood, so the wire
 * format matches bit-for-bit). Decimal and UnixSeconds are hand-rolled
 * thin scalars that round-trip via strings / integers respectively.
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

export const UnixSeconds = new GraphQLScalarType({
  name: 'UnixSeconds',
  description:
    'Integer Unix timestamp in seconds (UTC). Wire format is Int; the scalar carries the unit/TZ contract in the type system rather than the field name.',
  serialize: (value: unknown): number => {
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        throw new TypeError(`UnixSeconds must be an integer; got ${value}`);
      }
      return value;
    }
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Date) return Math.floor(value.getTime() / 1000);
    throw new TypeError(
      `UnixSeconds cannot serialize value of type ${typeof value}: ${String(value)}`
    );
  },
  parseValue: (value: unknown): number => {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    throw new TypeError(
      `UnixSeconds must be parsed from an integer; got ${typeof value}`
    );
  },
  parseLiteral: (ast): number => {
    if (ast.kind === 'IntValue') return parseInt(ast.value, 10);
    throw new TypeError('UnixSeconds must be an integer literal');
  },
});

export const Decimal = new GraphQLScalarType({
  name: 'Decimal',
  description:
    'Prisma.Decimal — round-tripped as a decimal string with arbitrary precision.',
  serialize: (value: unknown): string => {
    if (value instanceof Prisma.Decimal) {
      return (value as { toString(): string }).toString();
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    throw new Error(
      `Decimal cannot serialize value of type ${typeof value}: ${String(value)}`
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
  UnixSeconds,
};
