/**
 * Custom scalar resolvers for the non-standard scalars in our SDL:
 * DateTimeISO, DateTime, BigInt, Decimal, UnixSeconds, Address, Bytes32.
 *
 * DateTimeISO / DateTime / BigInt are provided verbatim by `graphql-scalars`
 * (same package typegraphql-prisma used under the hood, so the wire
 * format matches bit-for-bit). `DateTime` is wired to the same resolver
 * as `DateTimeISO` — it's the name the redesigned surface uses, kept
 * binary-compatible so backends serving both old and new types share one
 * wire format. Decimal and UnixSeconds are hand-rolled thin scalars that
 * round-trip via strings / integers respectively. Address and Bytes32
 * validate the 0x-prefixed lowercase-hex shape Sapience uses for
 * Ethereum addresses (20 bytes) and on-chain hashes / EAS UIDs (32 bytes).
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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

const parseHexScalar = (
  scalarName: string,
  re: RegExp,
  value: unknown
): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${scalarName} must be a string; got ${typeof value}`);
  }
  if (!re.test(value)) {
    throw new TypeError(`${scalarName} has invalid format: ${value}`);
  }
  return value.toLowerCase();
};

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

export const Address = new GraphQLScalarType({
  name: 'Address',
  description:
    '0x-prefixed lowercase 20-byte Ethereum address. Mixed-case checksum input is accepted and normalized to lowercase.',
  serialize: (value: unknown): string => {
    if (typeof value !== 'string') {
      throw new TypeError(
        `Address cannot serialize value of type ${typeof value}: ${String(value)}`
      );
    }
    // Indexer rows already store lowercase, but normalize defensively in
    // case a caller hands us a checksum address from chain-side code.
    const normalized = value.toLowerCase();
    if (!ADDRESS_RE.test(normalized)) {
      throw new TypeError(`Address cannot serialize invalid value: ${value}`);
    }
    return normalized;
  },
  parseValue: (value: unknown): string =>
    parseHexScalar('Address', ADDRESS_RE, value),
  parseLiteral: (ast): string => {
    if (ast.kind !== 'StringValue') {
      throw new TypeError('Address must be a string literal');
    }
    return parseHexScalar('Address', ADDRESS_RE, ast.value);
  },
});

export const Bytes32 = new GraphQLScalarType({
  name: 'Bytes32',
  description:
    '0x-prefixed lowercase 32-byte hex value. Used for transaction hashes, EAS UIDs, and other 32-byte on-chain identifiers.',
  serialize: (value: unknown): string => {
    if (typeof value !== 'string') {
      throw new TypeError(
        `Bytes32 cannot serialize value of type ${typeof value}: ${String(value)}`
      );
    }
    const normalized = value.toLowerCase();
    if (!BYTES32_RE.test(normalized)) {
      throw new TypeError(`Bytes32 cannot serialize invalid value: ${value}`);
    }
    return normalized;
  },
  parseValue: (value: unknown): string =>
    parseHexScalar('Bytes32', BYTES32_RE, value),
  parseLiteral: (ast): string => {
    if (ast.kind !== 'StringValue') {
      throw new TypeError('Bytes32 must be a string literal');
    }
    return parseHexScalar('Bytes32', BYTES32_RE, ast.value);
  },
});

/**
 * Same wire format as `DateTimeISO` — the redesigned surface uses the
 * `DateTime` name. Cloning the underlying scalar with a renamed config
 * is necessary because `makeExecutableSchema` keys the schema by the
 * resolver instance's `.name`, so reusing `DateTimeISOResolver` under
 * two map keys produces a duplicate-type warning at emit time.
 */
export const DateTime = new GraphQLScalarType({
  ...DateTimeISOResolver.toConfig(),
  name: 'DateTime',
});

export const scalarResolvers = {
  DateTimeISO: DateTimeISOResolver,
  DateTime,
  BigInt: BigIntResolver,
  Decimal,
  UnixSeconds,
  Address,
  Bytes32,
};
