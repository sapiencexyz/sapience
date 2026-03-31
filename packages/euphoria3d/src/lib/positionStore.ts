import type { CubeKey } from '../components/QuoteCubes';
import type { EnvMode } from './envConfig';

const STORAGE_KEY = 'euphoria3d:positions';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StoredPosition {
  id: string;
  cubeKey: CubeKey;
  status: 'accepting' | 'accepted' | 'filled';
  predictionId?: string;
  won?: boolean;
  worldPos: { x: number; y: number; z: number };
  auctionMeta: {
    picks: Array<{ conditionResolver: string; conditionId: string; predictedOutcome: number }>;
    predictorCollateral: string;
    predictorNonce: number;
    predictorDeadline: number;
  };
  bestBid: {
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
    counterpartySignature: string;
    counterpartySessionKeyData?: string;
  };
  bidAmount?: string;
  probability?: number;
  envMode: EnvMode;
  savedAt: number;
}

export function loadPositions(envMode: EnvMode): StoredPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all: StoredPosition[] = JSON.parse(raw);
    const now = Date.now();
    return all.filter((p) => p.envMode === envMode && now - p.savedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

/** Upsert a position into the store (keyed by id). */
export function upsertPosition(pos: StoredPosition): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: StoredPosition[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((p) => p.id === pos.id);
    if (idx >= 0) {
      all[idx] = pos;
    } else {
      all.push(pos);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Remove a position from the store. */
export function removePosition(id: string, envMode: EnvMode): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const all: StoredPosition[] = JSON.parse(raw);
    const filtered = all.filter((p) => !(p.id === id && p.envMode === envMode));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}
