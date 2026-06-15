/**
 * Opaque cursor encoding used by v1's `*Page` resolvers. v2 has its own
 * copy under `../v2/relay/cursor.ts`; this file remains for the v1 SDL
 * resolvers that still encode offset cursors the same way.
 */

export type CursorPayload = {
  k: string;
  id: string;
};

const isCursorPayload = (value: unknown): value is CursorPayload => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.k === 'string' && typeof obj.id === 'string';
};

export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');

export const decodeCursor = (cursor: string): CursorPayload | null => {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    return isCursorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
