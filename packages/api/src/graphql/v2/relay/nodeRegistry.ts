/**
 * v2-scoped Node registry — independent from `graphql/relay/globalId.ts`.
 *
 * Rationale (see ../PLAN.md § Identity model): v1 and v2 both define a
 * type literally named `Account` (and will define more colliding names
 * over time). The v1 registry is module-global with a single loader per
 * type name, which cannot serve both endpoints from the same process.
 * v2 maintains its own registry here.
 *
 * The encoding is intentionally identical to v1 — `base64url(Type:id)` —
 * so the same client-side decode helper works for either endpoint when
 * inspecting an id. The two registries are otherwise disjoint: a v1
 * `Account` global id is meaningless to v2 and vice versa.
 *
 * PUBLIC-API CONTRACT: once a type is registered and shipped from v2,
 * its name is frozen — every previously-issued id embeds it. See the
 * matching contract docstring on the v1 module for the longer rationale.
 */

export type NodeTypeNameV2 = string;

export type GlobalIdPartsV2 = {
  type: string;
  id: string;
};

export type NodeLoaderV2 = (
  id: string,
  ctx: unknown
) => Promise<unknown | null>;

export type NodeRegistrationV2 = {
  type: string;
  loader: NodeLoaderV2;
};

export class InvalidGlobalIdErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGlobalIdErrorV2';
  }
}

/**
 * Frozen list of every type name registered against the v2 registry.
 * Empty in the stub PR; each per-entity phase appends to it alongside
 * the schema change that adds `implements Node`. The snapshot test
 * cross-checks this against the runtime registry to catch silent
 * renames or removals — v2 global ids are public from day one.
 */
export const FROZEN_NODE_TYPES_V2: readonly string[] = ['Account', 'Vault'];

const SEPARATOR = ':';

const registry = new Map<string, NodeRegistrationV2>();

export const toGlobalIdV2 = (type: string, id: string | number): string => {
  if (!type) {
    throw new InvalidGlobalIdErrorV2('type must be non-empty');
  }
  if (!registry.has(type)) {
    throw new InvalidGlobalIdErrorV2(
      `Cannot encode v2 global id: type "${type}" is not registered. ` +
        'Register it via registerNodeTypeV2({ type, loader }).'
    );
  }
  const raw = `${type}${SEPARATOR}${String(id)}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
};

export const fromGlobalIdV2 = (opaqueId: string): GlobalIdPartsV2 => {
  let decoded: string;
  try {
    decoded = Buffer.from(opaqueId, 'base64url').toString('utf8');
  } catch {
    throw new InvalidGlobalIdErrorV2(`malformed v2 global id: ${opaqueId}`);
  }
  const separatorIdx = decoded.indexOf(SEPARATOR);
  if (separatorIdx <= 0) {
    throw new InvalidGlobalIdErrorV2(
      `malformed v2 global id payload: ${opaqueId} (decoded: ${decoded})`
    );
  }
  const type = decoded.slice(0, separatorIdx);
  const id = decoded.slice(separatorIdx + 1);
  if (!type) {
    throw new InvalidGlobalIdErrorV2(`empty type in v2 global id: ${opaqueId}`);
  }
  // Round-trip check — Node's base64url decoder is lenient and will
  // accept garbage input silently. Re-encode and compare to confirm.
  const reencoded = Buffer.from(decoded, 'utf8').toString('base64url');
  if (reencoded !== opaqueId) {
    throw new InvalidGlobalIdErrorV2(`malformed v2 global id: ${opaqueId}`);
  }
  return { type, id };
};

export const tryFromGlobalIdV2 = (opaqueId: string): GlobalIdPartsV2 | null => {
  try {
    return fromGlobalIdV2(opaqueId);
  } catch {
    return null;
  }
};

export const registerNodeTypeV2 = (registration: NodeRegistrationV2): void => {
  if (!registration.type) {
    throw new Error('NodeRegistrationV2.type must be non-empty');
  }
  if (registry.has(registration.type)) {
    throw new Error(`v2 Node type already registered: ${registration.type}`);
  }
  registry.set(registration.type, registration);
};

export const __resetNodeRegistryV2 = (): void => {
  registry.clear();
};

export const registeredNodeTypesV2 = (): string[] =>
  Array.from(registry.keys());

const loadOneV2 = async (
  opaqueId: string,
  ctx: unknown
): Promise<unknown | null> => {
  const parts = tryFromGlobalIdV2(opaqueId);
  if (!parts) return null;
  const registration = registry.get(parts.type);
  if (!registration) return null;
  const result = await registration.loader(parts.id, ctx);
  if (result == null) return null;
  if (typeof result === 'object' && !('__typename' in result)) {
    (result as { __typename?: string }).__typename = parts.type;
  }
  return result;
};

export const resolveNodeV2 = async (
  opaqueId: string,
  ctx: unknown
): Promise<unknown | null> => loadOneV2(opaqueId, ctx);

export const resolveNodesV2 = async (
  opaqueIds: readonly string[],
  ctx: unknown
): Promise<(unknown | null)[]> =>
  Promise.all(opaqueIds.map((id) => loadOneV2(id, ctx)));

export const verifyFrozenNodeTypesV2 = ():
  | { ok: true }
  | { ok: false; message: string } => {
  const registered = registeredNodeTypesV2().sort();
  const frozen = [...FROZEN_NODE_TYPES_V2].sort();
  const missing = frozen.filter((t) => !registered.includes(t));
  const extra = registered.filter((t) => !frozen.includes(t));
  if (missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }
  const lines: string[] = [
    'Registered v2 Node types do not match FROZEN_NODE_TYPES_V2.',
    'Type names are a public API contract: never rename or remove without a deprecation cycle.',
  ];
  if (missing.length > 0) {
    lines.push(
      `  Missing from registry (declared frozen but no registration): ${missing.join(', ')}`
    );
  }
  if (extra.length > 0) {
    lines.push(
      `  Missing from FROZEN_NODE_TYPES_V2 (registered but not declared frozen): ${extra.join(', ')}`
    );
  }
  return { ok: false, message: lines.join('\n') };
};
