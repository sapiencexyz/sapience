/**
 * Custom scalar resolvers for v2's scalar set: `Address`, `BigInt`,
 * `Bytes32`, `DateTimeISO`, `UnixSeconds`.
 *
 * `DateTimeISO` and `BigInt` come verbatim from `graphql-scalars`.
 * `UnixSeconds` is a hand-rolled integer scalar that carries the
 * unit/TZ contract in the type system rather than the field name.
 * `Address` and `Bytes32` validate the 0x-prefixed lowercase-hex shape
 * Sapience uses for 20-byte / 32-byte on-chain identifiers.
 */

import { GraphQLScalarType } from 'graphql';
import { DateTimeISOResolver, BigIntResolver } from 'graphql-scalars';

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
    'Integer epoch seconds. Wire format is Int; the scalar carries the unit/TZ contract in the type system rather than the field name.',
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

export const scalarResolvers = {
  Address,
  BigInt: BigIntResolver,
  Bytes32,
  DateTimeISO: DateTimeISOResolver,
  UnixSeconds,
};
