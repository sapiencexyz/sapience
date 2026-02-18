import { useEffect, useState } from 'react';

type LazerFeedRow = {
  pyth_lazer_id?: unknown;
  symbol?: unknown;
  description?: unknown;
};

let cachedLazerMap: Map<number, string> | null = null;
let inflightLazer: Promise<Map<number, string>> | null = null;

function normalizeBytes32Hex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const hex = s.startsWith('0x') ? s : `0x${s}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex.toLowerCase();
}

function tryParseUint32(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    if (value < 0 || value > 0xffff_ffff) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  try {
    // base-10 uint32
    if (/^\d+$/.test(s)) {
      const v = BigInt(s);
      if (v > 0xffff_ffffn) return null;
      return Number(v);
    }

    // hex uint32 (0x... or bare)
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

function tryExtractLazerFeeds(json: unknown): LazerFeedRow[] {
  const root = json as any;
  const candidates: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray(root?.data)
      ? root.data
      : Array.isArray(root?.symbols)
        ? root.symbols
        : [];

  const out: LazerFeedRow[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const o = item as any;
    out.push({
      pyth_lazer_id: o.pyth_lazer_id,
      symbol: o.symbol,
      description: o.description,
    });
  }
  return out;
}

function extractLazerIdMaybe(priceId: string): number | null {
  // On-chain we encode the Lazer uint32 feed id in the low bits of a bytes32.
  const bytes32 = normalizeBytes32Hex(priceId);
  if (!bytes32) return tryParseUint32(priceId);

  try {
    const v = BigInt(bytes32);
    if (v > 0xffff_ffffn) return null;
    return Number(v);
  } catch {
    return null;
  }
}

async function loadLazerFeedMap(): Promise<Map<number, string>> {
  if (cachedLazerMap) return cachedLazerMap;
  if (inflightLazer) return inflightLazer;

  inflightLazer = (async () => {
    const res = await fetch(
      'https://history.pyth-lazer.dourolabs.app/history/v1/symbols',
      { method: 'GET' }
    );
    if (!res.ok) throw new Error(`Lazer symbols failed: ${res.status}`);
    const json = (await res.json()) as unknown;
    const feeds = tryExtractLazerFeeds(json);
    const map = new Map<number, string>();
    for (const f of feeds) {
      const id = tryParseUint32(f.pyth_lazer_id);
      if (typeof id !== 'number') continue;
      const sym = typeof f.symbol === 'string' ? f.symbol.trim() : '';
      const desc =
        typeof f.description === 'string' ? f.description.trim() : '';
      const label = sym.length > 0 ? sym : desc.length > 0 ? desc : null;
      if (label) map.set(id, label);
    }
    cachedLazerMap = map;
    return map;
  })();

  try {
    return await inflightLazer;
  } finally {
    inflightLazer = null;
  }
}

export function getPythFeedLabelSync(priceId: string): string | null {
  const lazerId = extractLazerIdMaybe(priceId);
  if (typeof lazerId === 'number') return cachedLazerMap?.get(lazerId) ?? null;
  return null;
}

export function usePythFeedLabel(
  priceId: string | null | undefined
): string | null {
  const [label, setLabel] = useState<string | null>(() => {
    if (!priceId) return null;
    return getPythFeedLabelSync(priceId);
  });

  useEffect(() => {
    if (!priceId) {
      setLabel(null);
      return;
    }

    const lazerId = extractLazerIdMaybe(priceId);
    if (typeof lazerId === 'number') {
      const existing = cachedLazerMap?.get(lazerId) ?? null;
      if (existing) {
        setLabel(existing);
        return;
      }
      let cancelled = false;
      loadLazerFeedMap()
        .then((m) => {
          if (cancelled) return;
          setLabel(m.get(lazerId) ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setLabel(null);
        });
      return () => {
        cancelled = true;
      };
    }

    // Not a Lazer id (uint32 / bytes32-with-low-bits-uint32). We don't resolve Hermes labels here.
    setLabel(null);
  }, [priceId]);

  return label;
}
