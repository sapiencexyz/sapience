import { describe, it, expect } from 'vitest';
import { Kind } from 'graphql';

import { Address, Bytes32, scalarResolvers } from './scalars';

const VALID_ADDRESS_LOWER = '0xabcdef0123456789abcdef0123456789abcdef01';
const VALID_ADDRESS_MIXED = '0xAbCdEf0123456789aBcDeF0123456789ABCDEF01';
const VALID_BYTES32 = '0x' + 'a'.repeat(64);
const VALID_BYTES32_MIXED = '0x' + 'Ab'.repeat(32);

describe('Address scalar', () => {
  it('serializes a lowercase address verbatim', () => {
    expect(Address.serialize(VALID_ADDRESS_LOWER)).toBe(VALID_ADDRESS_LOWER);
  });

  it('serializes a mixed-case (checksum) address by lowercasing it', () => {
    expect(Address.serialize(VALID_ADDRESS_MIXED)).toBe(VALID_ADDRESS_LOWER);
  });

  it('serialize throws on non-string input', () => {
    expect(() => Address.serialize(42)).toThrow(TypeError);
    expect(() => Address.serialize(null)).toThrow(TypeError);
    expect(() => Address.serialize(undefined)).toThrow(TypeError);
  });

  it('serialize throws on malformed input', () => {
    expect(() => Address.serialize('not-an-address')).toThrow(TypeError);
    expect(() => Address.serialize('0xabc')).toThrow(TypeError);
    expect(() => Address.serialize('0x' + 'g'.repeat(40))).toThrow(TypeError);
  });

  it('parseValue accepts mixed-case input and normalizes to lowercase', () => {
    expect(Address.parseValue(VALID_ADDRESS_MIXED)).toBe(VALID_ADDRESS_LOWER);
  });

  it('parseValue throws on malformed input', () => {
    expect(() => Address.parseValue('0xabc')).toThrow(TypeError);
    expect(() => Address.parseValue(123)).toThrow(TypeError);
  });

  it('parseLiteral accepts string literals only', () => {
    expect(
      Address.parseLiteral({
        kind: Kind.STRING,
        value: VALID_ADDRESS_MIXED,
      })
    ).toBe(VALID_ADDRESS_LOWER);
    expect(() => Address.parseLiteral({ kind: Kind.INT, value: '42' })).toThrow(
      TypeError
    );
  });
});

describe('Bytes32 scalar', () => {
  it('serializes a lowercase 32-byte hex verbatim', () => {
    expect(Bytes32.serialize(VALID_BYTES32)).toBe(VALID_BYTES32);
  });

  it('serializes a mixed-case 32-byte hex by lowercasing it', () => {
    expect(Bytes32.serialize(VALID_BYTES32_MIXED)).toBe(
      VALID_BYTES32_MIXED.toLowerCase()
    );
  });

  it('serialize throws on non-string input', () => {
    expect(() => Bytes32.serialize(42)).toThrow(TypeError);
    expect(() => Bytes32.serialize(null)).toThrow(TypeError);
  });

  it('serialize throws on wrong length', () => {
    // 20 bytes — valid address, invalid bytes32
    expect(() => Bytes32.serialize(VALID_ADDRESS_LOWER)).toThrow(TypeError);
    // 33 bytes
    expect(() => Bytes32.serialize('0x' + 'a'.repeat(66))).toThrow(TypeError);
  });

  it('parseValue accepts valid input', () => {
    expect(Bytes32.parseValue(VALID_BYTES32)).toBe(VALID_BYTES32);
  });

  it('parseValue throws on malformed input', () => {
    expect(() => Bytes32.parseValue('0xabc')).toThrow(TypeError);
    expect(() => Bytes32.parseValue('not-hex')).toThrow(TypeError);
  });

  it('parseLiteral accepts string literals only', () => {
    expect(
      Bytes32.parseLiteral({ kind: Kind.STRING, value: VALID_BYTES32 })
    ).toBe(VALID_BYTES32);
    expect(() => Bytes32.parseLiteral({ kind: Kind.INT, value: '42' })).toThrow(
      TypeError
    );
  });
});

describe('scalarResolvers map', () => {
  it('registers every scalar the SDL declares', () => {
    expect(Object.keys(scalarResolvers).sort()).toEqual(
      [
        'Address',
        'BigInt',
        'Bytes32',
        'DateTime',
        'DateTimeISO',
        'Decimal',
        'UnixSeconds',
      ].sort()
    );
  });

  it('exposes DateTime and DateTimeISO with byte-identical wire format', () => {
    // Different scalar instances (so makeExecutableSchema sees them as
    // distinct types under the right names), but their serialize/parse
    // behavior is the same — both round-trip ISO 8601 strings.
    const sample = new Date('2026-05-15T12:00:00.000Z');
    const dateTimeISO = scalarResolvers.DateTimeISO;
    const dateTime = scalarResolvers.DateTime;
    expect(dateTime).not.toBe(dateTimeISO);
    expect(dateTime.serialize(sample)).toBe(dateTimeISO.serialize(sample));
    expect(dateTime.parseValue('2026-05-15T12:00:00Z')).toEqual(
      dateTimeISO.parseValue('2026-05-15T12:00:00Z')
    );
  });
});
