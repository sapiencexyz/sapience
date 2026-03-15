import { describe, it, expect } from 'vitest';
import { toHex, type Hex } from 'viem';
import {
  parseMarketFromDescription,
  decodeFeedIdFromPriceId,
  findHexStringsDeep,
  decodeEvmBinaryToHex,
  extractEvmBlobFromJson,
  parseLazerPayload,
} from '../pyth';

// ============ parseMarketFromDescription ============

describe('parseMarketFromDescription', () => {
  it('parses a valid PYTH_LAZER description', () => {
    const desc =
      'PYTH_LAZER|priceId=0x0000000000000000000000000000000000000000000000000000000000000002|endTime=1700000000|strikePrice=50000|strikeExpo=-8|overWinsOnTie=1';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.priceId).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000002'
    );
    expect(result!.endTime).toBe(1700000000n);
    expect(result!.strikePrice).toBe(50000n);
    expect(result!.strikeExpo).toBe(-8);
    expect(result!.overWinsOnTie).toBe(true);
  });

  it('parses overWinsOnTie=0 as false', () => {
    const desc =
      'PYTH_LAZER|priceId=0x01|endTime=100|strikePrice=200|strikeExpo=-6|overWinsOnTie=0';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.overWinsOnTie).toBe(false);
  });

  it('defaults overWinsOnTie to false when missing', () => {
    const desc =
      'PYTH_LAZER|priceId=0x01|endTime=100|strikePrice=200|strikeExpo=-6';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.overWinsOnTie).toBe(false);
  });

  it('adds 0x prefix when priceId lacks it', () => {
    const desc =
      'PYTH_LAZER|priceId=0000000000000000000000000000000000000000000000000000000000000005|endTime=100|strikePrice=200|strikeExpo=-6';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.priceId).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000005'
    );
  });

  it('returns null for non-PYTH_LAZER descriptions', () => {
    expect(parseMarketFromDescription('MANUAL|foo=bar')).toBeNull();
    expect(parseMarketFromDescription('some random text')).toBeNull();
    expect(parseMarketFromDescription('')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(
      parseMarketFromDescription('PYTH_LAZER|priceId=0x01|endTime=100')
    ).toBeNull();
    expect(
      parseMarketFromDescription(
        'PYTH_LAZER|priceId=0x01|strikePrice=200|strikeExpo=-6'
      )
    ).toBeNull();
  });

  it('handles extra fields like strikeDecimal gracefully', () => {
    const desc =
      'PYTH_LAZER|priceId=0x02|endTime=100|strikePrice=200|strikeExpo=-6|strikeDecimal=0.002|overWinsOnTie=1';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.strikePrice).toBe(200n);
  });

  it('handles negative strikePrice', () => {
    const desc =
      'PYTH_LAZER|priceId=0x02|endTime=100|strikePrice=-500|strikeExpo=-6|overWinsOnTie=0';
    const result = parseMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.strikePrice).toBe(-500n);
  });
});

// ============ decodeFeedIdFromPriceId ============

describe('decodeFeedIdFromPriceId', () => {
  it('decodes small integer priceIds (Lazer feed IDs)', () => {
    expect(decodeFeedIdFromPriceId('0x02' as Hex)).toBe(2);
    expect(
      decodeFeedIdFromPriceId(
        '0x0000000000000000000000000000000000000000000000000000000000000005' as Hex
      )
    ).toBe(5);
  });

  it('returns null for feedId 0', () => {
    expect(decodeFeedIdFromPriceId('0x00' as Hex)).toBeNull();
  });

  it('returns null for priceIds larger than uint32', () => {
    // 0x1_0000_0000 = 4294967296, exceeds uint32 max
    expect(decodeFeedIdFromPriceId('0x100000000' as Hex)).toBeNull();
  });

  it('returns null for typical Pyth Hermes 32-byte priceIds', () => {
    // These are SHA-256 hashes, way larger than uint32
    expect(
      decodeFeedIdFromPriceId(
        '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as Hex
      )
    ).toBeNull();
  });

  it('handles max uint32 value', () => {
    expect(decodeFeedIdFromPriceId('0xFFFFFFFF' as Hex)).toBe(4294967295);
  });
});

// ============ findHexStringsDeep ============

describe('findHexStringsDeep', () => {
  it('finds hex strings prefixed with 0x', () => {
    expect(findHexStringsDeep('0xdeadbeef')).toEqual(['0xdeadbeef']);
  });

  it('finds long bare hex strings (>=200 chars, even length)', () => {
    const longHex = 'ab'.repeat(100); // 200 chars
    const result = findHexStringsDeep(longHex);
    expect(result).toEqual([`0x${longHex}`]);
  });

  it('ignores short bare hex strings', () => {
    expect(findHexStringsDeep('deadbeef')).toEqual([]);
  });

  it('ignores non-hex strings', () => {
    expect(findHexStringsDeep('hello world')).toEqual([]);
    expect(findHexStringsDeep('0xGHIJ')).toEqual([]);
  });

  it('traverses nested objects', () => {
    const obj = {
      a: { b: '0xabc123' },
      c: [{ d: '0xdef456' }],
    };
    const result = findHexStringsDeep(obj);
    expect(result).toContain('0xabc123');
    expect(result).toContain('0xdef456');
  });

  it('traverses arrays', () => {
    expect(findHexStringsDeep(['0xaa', '0xbb'])).toEqual(['0xaa', '0xbb']);
  });

  it('returns empty for non-object/non-string', () => {
    expect(findHexStringsDeep(42)).toEqual([]);
    expect(findHexStringsDeep(null)).toEqual([]);
    expect(findHexStringsDeep(undefined)).toEqual([]);
  });
});

// ============ decodeEvmBinaryToHex ============

describe('decodeEvmBinaryToHex', () => {
  it('passes through 0x-prefixed hex with encoding=hex', () => {
    expect(decodeEvmBinaryToHex('0xdeadbeef', 'hex')).toBe('0xdeadbeef');
  });

  it('passes through 0x-prefixed hex with encoding=null', () => {
    expect(decodeEvmBinaryToHex('0xdeadbeef', null)).toBe('0xdeadbeef');
  });

  it('adds 0x prefix for bare hex with encoding=hex', () => {
    expect(decodeEvmBinaryToHex('deadbeef', 'hex')).toBe('0xdeadbeef');
  });

  it('decodes base64 to hex', () => {
    // "deadbeef" in hex = [0xde, 0xad, 0xbe, 0xef]
    const b64 = Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64');
    const result = decodeEvmBinaryToHex(b64, 'base64');
    expect(result).toBe('0xdeadbeef');
  });

  it('throws for unknown encoding with non-hex data', () => {
    expect(() => decodeEvmBinaryToHex('not-hex!!!', 'xml')).toThrow(
      'pyth_evm_blob_unknown_encoding:xml'
    );
  });

  it('falls through to hex for unknown encoding with valid hex', () => {
    expect(decodeEvmBinaryToHex('0xabcdef', 'unknown')).toBe('0xabcdef');
  });
});

// ============ extractEvmBlobFromJson ============

describe('extractEvmBlobFromJson', () => {
  it('extracts from { evm: { data: "0x...", encoding: "hex" } }', () => {
    const json = { evm: { data: '0xdeadbeef', encoding: 'hex' } };
    const { blob, source } = extractEvmBlobFromJson(json);
    expect(blob).toBe('0xdeadbeef');
    expect(source).toBe('evm.data');
  });

  it('extracts from { evm: { data: ["0x..."], encoding: "hex" } }', () => {
    const json = { evm: { data: ['0xdeadbeef'], encoding: 'hex' } };
    const { blob } = extractEvmBlobFromJson(json);
    expect(blob).toBe('0xdeadbeef');
  });

  it('extracts from { data: { evm: { data: "0x...", encoding: "hex" } } }', () => {
    const json = { data: { evm: { data: '0xdeadbeef', encoding: 'hex' } } };
    const { blob, source } = extractEvmBlobFromJson(json);
    expect(blob).toBe('0xdeadbeef');
    expect(source).toBe('data.evm.data');
  });

  it('extracts base64-encoded data', () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const json = {
      evm: { data: bytes.toString('base64'), encoding: 'base64' },
    };
    const { blob } = extractEvmBlobFromJson(json);
    expect(blob).toBe('0xdeadbeef');
  });

  it('falls back to deep-scan for unstructured JSON with long hex strings', () => {
    const longHex = '0x' + 'ab'.repeat(150); // 302 chars total (> 202)
    const json = { nested: { deeply: { value: longHex } } };
    const { blob, source } = extractEvmBlobFromJson(json);
    expect(blob).toBe(longHex);
    expect(source).toBe('deep-scan');
  });

  it('prefers the longest blob when multiple are found', () => {
    const short = '0x' + 'ab'.repeat(120);
    const long = '0x' + 'cd'.repeat(200);
    const json = { nested: { a: short, b: long } };
    const { blob } = extractEvmBlobFromJson(json);
    expect(blob).toBe(long);
  });

  it('throws when no evm blob found', () => {
    expect(() => extractEvmBlobFromJson({ foo: 'bar' })).toThrow(
      'pyth_response_missing_evm_blob'
    );
    expect(() => extractEvmBlobFromJson({})).toThrow(
      'pyth_response_missing_evm_blob'
    );
  });
});

// ============ parseLazerPayload ============

describe('parseLazerPayload', () => {
  // Build a minimal valid Lazer payload:
  // [4 bytes magic] [8 bytes timestampUs] [1 byte channel] [1 byte feedsLen]
  // For each feed: [4 bytes feedId] [1 byte numProps] [prop entries...]
  // Property: [1 byte propId] [value bytes depending on propId]

  function buildPayload(opts: {
    magic?: number;
    timestampUs: bigint;
    channel: number;
    feeds: Array<{
      feedId: number;
      props: Array<{ id: number; value: bigint | number }>;
    }>;
  }): Hex {
    const magic = opts.magic ?? 2479346549;
    const parts: number[] = [];

    // magic (u32 BE)
    parts.push((magic >>> 24) & 0xff);
    parts.push((magic >>> 16) & 0xff);
    parts.push((magic >>> 8) & 0xff);
    parts.push(magic & 0xff);

    // timestampUs (u64 BE)
    const tsBytes = [];
    let ts = opts.timestampUs;
    for (let i = 0; i < 8; i++) {
      tsBytes.unshift(Number(ts & 0xffn));
      ts >>= 8n;
    }
    parts.push(...tsBytes);

    // channel (u8)
    parts.push(opts.channel);

    // feedsLen (u8)
    parts.push(opts.feeds.length);

    for (const feed of opts.feeds) {
      // feedId (u32 BE)
      parts.push((feed.feedId >>> 24) & 0xff);
      parts.push((feed.feedId >>> 16) & 0xff);
      parts.push((feed.feedId >>> 8) & 0xff);
      parts.push(feed.feedId & 0xff);

      // numProps (u8)
      parts.push(feed.props.length);

      for (const prop of feed.props) {
        parts.push(prop.id);

        if (prop.id === 0) {
          // Price: int64 BE
          let v = BigInt.asUintN(64, BigInt(prop.value));
          const priceBytes: number[] = [];
          for (let i = 0; i < 8; i++) {
            priceBytes.unshift(Number(v & 0xffn));
            v >>= 8n;
          }
          parts.push(...priceBytes);
        } else if (prop.id === 4) {
          // Exponent: int16 BE
          const exp = Number(prop.value) & 0xffff;
          parts.push((exp >>> 8) & 0xff);
          parts.push(exp & 0xff);
        } else if (prop.id === 3) {
          // uint16
          const val = Number(prop.value) & 0xffff;
          parts.push((val >>> 8) & 0xff);
          parts.push(val & 0xff);
        } else if (
          prop.id === 1 ||
          prop.id === 2 ||
          prop.id === 5 ||
          prop.id === 6 ||
          prop.id === 7 ||
          prop.id === 8
        ) {
          // int64/uint64 BE
          let v = BigInt.asUintN(64, BigInt(prop.value));
          const valBytes: number[] = [];
          for (let i = 0; i < 8; i++) {
            valBytes.unshift(Number(v & 0xffn));
            v >>= 8n;
          }
          parts.push(...valBytes);
        } else if (prop.id === 9) {
          // u8
          parts.push(Number(prop.value) & 0xff);
        }
      }
    }

    return toHex(new Uint8Array(parts));
  }

  it('parses a payload with one feed containing price and exponent', () => {
    const timestampUs = 1700000000_000000n;
    const hex = buildPayload({
      timestampUs,
      channel: 1,
      feeds: [
        {
          feedId: 2,
          props: [
            { id: 0, value: 5000000000n }, // price
            { id: 4, value: -8 }, // exponent
          ],
        },
      ],
    });

    const result = parseLazerPayload(hex);
    expect(result.timestampUs).toBe(timestampUs);
    expect(result.channel).toBe(1);
    expect(result.feedsLen).toBe(1);
    expect(result.feeds[2]).toBeDefined();
    expect(result.feeds[2]!.price).toBe(5000000000n);
    expect(result.feeds[2]!.exponent).toBe(-8);
  });

  it('parses a payload with multiple feeds', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [
        {
          feedId: 1,
          props: [{ id: 0, value: 100n }],
        },
        {
          feedId: 5,
          props: [
            { id: 0, value: 200n },
            { id: 4, value: -6 },
          ],
        },
      ],
    });

    const result = parseLazerPayload(hex);
    expect(result.feedsLen).toBe(2);
    expect(result.feeds[1]!.price).toBe(100n);
    expect(result.feeds[5]!.price).toBe(200n);
    expect(result.feeds[5]!.exponent).toBe(-6);
  });

  it('handles feed with no properties', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [{ feedId: 3, props: [] }],
    });

    const result = parseLazerPayload(hex);
    expect(result.feeds[3]).toEqual({});
  });

  it('skips BestBid (1), BestAsk (2), FundingRate (6) as int64 props', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [
        {
          feedId: 1,
          props: [
            { id: 0, value: 42n }, // price
            { id: 1, value: 100n }, // best bid (skipped)
            { id: 2, value: 200n }, // best ask (skipped)
            { id: 6, value: 300n }, // funding rate (skipped)
          ],
        },
      ],
    });

    const result = parseLazerPayload(hex);
    expect(result.feeds[1]!.price).toBe(42n);
  });

  it('skips PublisherCount (3) as uint16', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [
        {
          feedId: 1,
          props: [
            { id: 3, value: 10 }, // publisher count (skipped)
            { id: 0, value: 99n }, // price
          ],
        },
      ],
    });

    const result = parseLazerPayload(hex);
    expect(result.feeds[1]!.price).toBe(99n);
  });

  it('skips MarketSession (9) as u8', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [
        {
          feedId: 1,
          props: [
            { id: 9, value: 1 }, // market session (skipped)
            { id: 0, value: 77n }, // price
          ],
        },
      ],
    });

    const result = parseLazerPayload(hex);
    expect(result.feeds[1]!.price).toBe(77n);
  });

  it('throws on bad magic number', () => {
    const hex = buildPayload({
      magic: 0xdeadbeef,
      timestampUs: 1000000n,
      channel: 0,
      feeds: [],
    });

    expect(() => parseLazerPayload(hex)).toThrow('pyth_payload_bad_magic');
  });

  it('throws on truncated payload', () => {
    // Just the magic (2479346549 = 0x93c7d375), nothing else
    expect(() => parseLazerPayload('0x93c7d375' as Hex)).toThrow(
      'pyth_payload_oob'
    );
  });

  it('throws on unknown property ID', () => {
    const hex = buildPayload({
      timestampUs: 1000000n,
      channel: 0,
      feeds: [
        {
          feedId: 1,
          props: [{ id: 99, value: 0 }],
        },
      ],
    });

    expect(() => parseLazerPayload(hex)).toThrow(
      'pyth_payload_unknown_property:99'
    );
  });

  it('second-aligned timestamp has no sub-second component', () => {
    const exactSecond = 1700000000_000000n; // exactly on the second
    const hex = buildPayload({
      timestampUs: exactSecond,
      channel: 0,
      feeds: [],
    });

    const result = parseLazerPayload(hex);
    expect(result.timestampUs % 1_000_000n).toBe(0n);
  });

  it('non-second-aligned timestamp preserves sub-second component', () => {
    const notExact = 1700000000_500000n; // 500ms offset
    const hex = buildPayload({
      timestampUs: notExact,
      channel: 0,
      feeds: [],
    });

    const result = parseLazerPayload(hex);
    expect(result.timestampUs % 1_000_000n).toBe(500000n);
  });
});
