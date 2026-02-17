import type { PythLazerSymbolRow } from './types';

let cachedPythLazerSymbolMap: Map<number, string> | null = null;
let inflightPythLazerSymbolMap: Promise<Map<number, string>> | null = null;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getArrayProp(
  obj: Record<string, unknown>,
  key: string
): unknown[] | null {
  const v = obj[key];
  return Array.isArray(v) ? v : null;
}

export function tryParseUint32(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    if (value < 0 || value > 0xffff_ffff) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  try {
    if (/^\d+$/.test(s)) {
      const v = BigInt(s);
      if (v > 0xffff_ffffn) return null;
      return Number(v);
    }
    const hex = s.startsWith('0x') ? s : `0x${s}`;
    if (/^0x[0-9a-fA-F]{1,8}$/.test(hex)) {
      const v = BigInt(hex);
      if (v > 0xffff_ffffn) return null;
      return Number(v);
    }
  } catch {
    return null;
  }
  return null;
}

export function decodePythLazerIdFromBytes32(priceId: string): number | null {
  const s = String(priceId ?? '').trim();
  if (!s) return null;
  // priceId is usually bytes32 hex. If it isn't, allow parsing decimal/short-hex as a convenience.
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) return tryParseUint32(s);
  try {
    const v = BigInt(s);
    if (v > 0xffff_ffffn) return null;
    return Number(v);
  } catch {
    return null;
  }
}

export function tryExtractPythLazerRows(json: unknown): PythLazerSymbolRow[] {
  const candidates: unknown[] = Array.isArray(json)
    ? json
    : isRecord(json)
      ? (getArrayProp(json, 'data') ?? getArrayProp(json, 'symbols') ?? [])
      : [];
  const out: PythLazerSymbolRow[] = [];
  for (const item of candidates) {
    out.push({
      pyth_lazer_id: isRecord(item) ? item['pyth_lazer_id'] : undefined,
      symbol: isRecord(item) ? item['symbol'] : undefined,
      description: isRecord(item) ? item['description'] : undefined,
    });
  }
  return out;
}

export async function loadPythLazerSymbolMap(): Promise<Map<number, string>> {
  if (cachedPythLazerSymbolMap) return cachedPythLazerSymbolMap;
  if (inflightPythLazerSymbolMap) return inflightPythLazerSymbolMap;

  inflightPythLazerSymbolMap = (async () => {
    const res = await fetch(
      'https://history.pyth-lazer.dourolabs.app/history/v1/symbols'
    );
    if (!res.ok) throw new Error(`Pyth Lazer symbols failed (${res.status})`);
    const json = (await res.json()) as unknown;
    const rows = tryExtractPythLazerRows(json);
    const map = new Map<number, string>();
    for (const r of rows) {
      const id = tryParseUint32(r.pyth_lazer_id);
      if (typeof id !== 'number') continue;
      const sym = typeof r.symbol === 'string' ? r.symbol.trim() : '';
      const desc =
        typeof r.description === 'string' ? r.description.trim() : '';
      const label = sym.length > 0 ? sym : desc.length > 0 ? desc : null;
      if (label) map.set(id, label);
    }
    cachedPythLazerSymbolMap = map;
    return map;
  })();

  try {
    return await inflightPythLazerSymbolMap;
  } finally {
    inflightPythLazerSymbolMap = null;
  }
}

export async function resolvePythSyntheticQuestion(priceId: string): Promise<string> {
  const lazerId = decodePythLazerIdFromBytes32(priceId);
  if (typeof lazerId !== 'number') return `Pyth market ${priceId}`;
  try {
    const map = await loadPythLazerSymbolMap();
    return map.get(lazerId) ?? `Pyth Pro #${lazerId}`;
  } catch {
    return `Pyth Pro #${lazerId}`;
  }
}

export function formatPythDecimalFromInt(priceInt: bigint, expo: number): string {
  const sign = priceInt < 0n ? '-' : '';
  const digits = (priceInt < 0n ? -priceInt : priceInt).toString(10);
  if (!digits || /^0+$/.test(digits)) return '0';

  if (expo >= 0) return `${sign}${digits}${'0'.repeat(expo)}`;

  const places = Math.abs(expo);
  let out: string;
  if (digits.length <= places) {
    out = `0.${'0'.repeat(places - digits.length)}${digits}`;
  } else {
    const i = digits.length - places;
    out = `${digits.slice(0, i)}.${digits.slice(i)}`;
  }
  out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign + out;
}

export function buildPythLegDescriptor(params: {
  priceId: string;
  endTimeSec: number;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
}): string {
  // Keep a stable machine-readable prefix so the app can render OVER/UNDER $X like before.
  // Note: strikePrice is the on-chain int64 with strikeExpo (int32).
  return [
    'PYTH_LAZER',
    `priceId=${String(params.priceId).toLowerCase()}`,
    `endTime=${Math.floor(params.endTimeSec)}`,
    `strikePrice=${params.strikePrice.toString()}`,
    `strikeExpo=${Number(params.strikeExpo)}`,
    `overWinsOnTie=${params.overWinsOnTie ? '1' : '0'}`,
    `strikeDecimal=${formatPythDecimalFromInt(params.strikePrice, params.strikeExpo)}`,
  ].join('|');
}

/**
 * Reset cached Pyth Lazer symbol map (for testing).
 */
export function _resetPythLazerCache(): void {
  cachedPythLazerSymbolMap = null;
  inflightPythLazerSymbolMap = null;
}
