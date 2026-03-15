/**
 * Pure utility functions for Pyth Lazer settlement.
 *
 * Extracted from scripts/settle-pyth.ts so they can be unit-tested
 * without triggering script-level side effects (dotenv, top-level execution).
 */

import { hexToBytes, isHex, type Hex } from 'viem';
import type { PythBinaryOptionMarket } from '@sapience/sdk';

// ============ Types ============

export type Market = PythBinaryOptionMarket;

export interface ParsedLazerPayload {
  timestampUs: bigint;
  channel: number;
  feedsLen: number;
  feeds: Record<number, { price?: bigint; exponent?: number }>;
}

/** Loose shape of Pyth Lazer JSON responses for type-safe property access. */
interface PythEvmResponse {
  evm?: { data?: unknown; encoding?: unknown };
  data?: { evm?: { data?: unknown; encoding?: unknown } };
}

// ============ Market Parsing ============

/**
 * Parse market parameters from a Condition's description field.
 * Format: PYTH_LAZER|priceId=0x...|endTime=123|strikePrice=456|strikeExpo=-6|overWinsOnTie=1|strikeDecimal=...
 */
export function parseMarketFromDescription(description: string): Market | null {
  if (!description.startsWith('PYTH_LAZER')) return null;
  const params: Record<string, string> = {};
  for (const part of description.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  if (
    !params.priceId ||
    !params.endTime ||
    !params.strikePrice ||
    !params.strikeExpo
  )
    return null;
  const priceId = (
    params.priceId.startsWith('0x') ? params.priceId : `0x${params.priceId}`
  ) as Hex;
  return {
    priceId,
    endTime: BigInt(params.endTime),
    strikePrice: BigInt(params.strikePrice),
    strikeExpo: Number(params.strikeExpo),
    overWinsOnTie: params.overWinsOnTie === '1',
  };
}

export function decodeFeedIdFromPriceId(priceId: Hex): number | null {
  try {
    const raw = BigInt(priceId);
    if (raw === 0n || raw > 0xffff_ffffn) return null;
    return Number(raw);
  } catch {
    return null;
  }
}

// ============ EVM Blob Extraction ============

export function findHexStringsDeep(
  value: unknown,
  out: string[] = []
): string[] {
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]+$/.test(value)) out.push(value);
    if (
      /^[0-9a-fA-F]+$/.test(value) &&
      value.length >= 200 &&
      value.length % 2 === 0
    ) {
      out.push(`0x${value}`);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) findHexStringsDeep(v, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      findHexStringsDeep(v, out);
    }
  }
  return out;
}

export function decodeEvmBinaryToHex(
  data: string,
  encoding: string | null
): Hex {
  const s = data.startsWith('0x') ? data : `0x${data}`;
  if (encoding === 'hex' || encoding === null) {
    if (!isHex(s)) throw new Error('pyth_evm_blob_not_hex');
    return s as Hex;
  }
  if (encoding === 'base64') {
    const bytes = Buffer.from(data, 'base64');
    return `0x${bytes.toString('hex')}` as Hex;
  }
  if (isHex(s)) return s as Hex;
  throw new Error(`pyth_evm_blob_unknown_encoding:${encoding}`);
}

export function extractEvmBlobFromJson(json: unknown): {
  blob: Hex;
  source: string;
} {
  const j = json as PythEvmResponse;

  const candidates: Array<{
    data: string;
    encoding: string | null;
    source: string;
  }> = [];

  const pushIfString = (val: unknown, encoding: unknown, source: string) => {
    if (typeof val === 'string') {
      candidates.push({
        data: val,
        encoding: typeof encoding === 'string' ? encoding : null,
        source,
      });
    }
  };
  const pushIfStringArray = (
    val: unknown,
    encoding: unknown,
    source: string
  ) => {
    if (Array.isArray(val) && val.every((x) => typeof x === 'string')) {
      for (let i = 0; i < val.length; i++) {
        candidates.push({
          data: val[i] as string,
          encoding: typeof encoding === 'string' ? encoding : null,
          source: `${source}[${i}]`,
        });
      }
    }
  };

  pushIfString(j?.evm?.data, j?.evm?.encoding, 'evm.data');
  pushIfStringArray(j?.evm?.data, j?.evm?.encoding, 'evm.data');
  pushIfString(j?.data?.evm?.data, j?.data?.evm?.encoding, 'data.evm.data');
  pushIfStringArray(
    j?.data?.evm?.data,
    j?.data?.evm?.encoding,
    'data.evm.data'
  );

  // Fallback: scan all hex strings deep, prefer very long blobs.
  if (candidates.length === 0) {
    const hexes = findHexStringsDeep(json);
    const big = [...new Set(hexes)].filter((h) => h.length >= 2 + 200);
    for (const h of big)
      candidates.push({ data: h, encoding: 'hex', source: 'deep-scan' });
  }

  if (candidates.length === 0) {
    throw new Error('pyth_response_missing_evm_blob');
  }

  const normalized = candidates
    .map((c) => ({
      ...c,
      key:
        c.encoding === 'base64'
          ? `b64:${c.data}`
          : `hex:${c.data.startsWith('0x') ? c.data : `0x${c.data}`}`,
    }))
    .filter((c) => c.data.length > 0);
  const byKey = new Map<string, (typeof normalized)[number]>();
  for (const c of normalized) {
    const prev = byKey.get(c.key);
    if (!prev || c.data.length > prev.data.length) byKey.set(c.key, c);
  }
  const unique = [...byKey.values()].sort(
    (a, b) => b.data.length - a.data.length
  );

  const best = unique[0]!;
  const blob = decodeEvmBinaryToHex(best.data, best.encoding);
  return { blob, source: best.source };
}

// ============ Pyth Payload Parsing ============

// Mirrors `PythLazerLibBytes` big-endian parsing.
export function parseLazerPayload(payloadHex: Hex): ParsedLazerPayload {
  const b = hexToBytes(payloadHex);
  let pos = 0;
  const requireBytes = (n: number) => {
    if (pos + n > b.length) throw new Error('pyth_payload_oob');
  };
  const readU8 = () => {
    requireBytes(1);
    return b[pos++]!;
  };
  const readU16BE = () => {
    requireBytes(2);
    const v = (b[pos]! << 8) | b[pos + 1]!;
    pos += 2;
    return v;
  };
  const readU32BE = () => {
    requireBytes(4);
    const v =
      (b[pos]! << 24) | (b[pos + 1]! << 16) | (b[pos + 2]! << 8) | b[pos + 3]!;
    pos += 4;
    return v >>> 0;
  };
  const readU64BE = () => {
    requireBytes(8);
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[pos + i]!);
    pos += 8;
    return v;
  };
  const readI64BE = () => BigInt.asIntN(64, readU64BE());
  const readI16BE = () => BigInt.asIntN(16, BigInt(readU16BE()));

  const FORMAT_MAGIC = 2479346549;
  const magic = readU32BE();
  if (magic !== FORMAT_MAGIC) throw new Error('pyth_payload_bad_magic');

  const timestampUs = readU64BE();
  const channel = readU8();
  const feedsLen = readU8();

  const feeds: ParsedLazerPayload['feeds'] = {};
  for (let i = 0; i < feedsLen; i++) {
    const feedId = readU32BE();
    const numProps = readU8();
    const feed: { price?: bigint; exponent?: number } = {};

    for (let j = 0; j < numProps; j++) {
      const propId = readU8();
      if (propId === 0) {
        feed.price = readI64BE();
      } else if (propId === 4) {
        feed.exponent = Number(readI16BE());
      } else if (propId === 1 || propId === 2 || propId === 6) {
        void readI64BE();
      } else if (propId === 3) {
        void readU16BE();
      } else if (propId === 5 || propId === 7 || propId === 8) {
        void readU64BE();
      } else if (propId === 9) {
        void readU8();
      } else {
        throw new Error(`pyth_payload_unknown_property:${propId}`);
      }
    }

    feeds[feedId] = feed;
  }

  return { timestampUs, channel, feedsLen, feeds };
}
