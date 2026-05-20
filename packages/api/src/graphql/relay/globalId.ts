/**
 * Relay-style global ID encoding and the `Node` type registry.
 *
 * The opaque global id encodes `{type, domainId}` as URL-safe base64.
 * Clients treat it as opaque; the server decodes it to dispatch
 * `node(id:)` / `nodes(ids:)` to the right loader. Domain identifiers
 * (predictionId, hash, uid, address) remain on the entity as separate
 * fields — the global id is a second identity layer for cache
 * normalization and polymorphic refetch.
 *
 * ---
 *
 * PUBLIC-API CONTRACT — READ THIS BEFORE CHANGING ANYTHING.
 *
 * Every opaque global id this module has ever issued is a public,
 * permanent identifier. Clients may put them in URLs, normalized
 * caches, webhooks, external systems. Two rules follow:
 *
 *   1. A registered `type` string is FROZEN. It is what's embedded in
 *      the encoding and what GraphQL returns as `__typename`. Renaming
 *      it is a public breaking change: every previously-issued id for
 *      that type orphans, every client query mentioning the old name
 *      breaks, every cache entry keyed on `${__typename}:${id}` flushes.
 *      Treat renames as a deprecation cycle (add new type alongside,
 *      `@deprecated` the old, migrate, remove), never as a refactor.
 *
 *   2. A retired type's name MUST NOT be re-used for a different
 *      entity. Once shipped, the name belongs to that entity forever.
 *      (When the first type is actually deprecated, add a tombstone
 *      set here and have `registerNodeType` reject re-registration.)
 *
 * The companion `FROZEN_NODE_TYPES` snapshot enforces (1) at CI time —
 * any change to a registered type name requires explicitly updating
 * the frozen list, which is intentionally uncomfortable.
 *
 * ---
 *
 * PR 1 ships the encoder/decoder and dispatch surface against an empty
 * registry. Per-entity PRs call `registerNodeType` at module import
 * time alongside the schema change that adds `implements Node`, and
 * append their type name to `FROZEN_NODE_TYPES`.
 */

/** Names of types that implement `Node` and have frozen public global-id formats. */
export type NodeTypeName = 'CollateralTransfer' | 'Vault' | 'Category';

export type GlobalIdParts = {
  type: string;
  id: string;
};

export type NodeLoader = (id: string, ctx: unknown) => Promise<unknown | null>;

export type NodeRegistration = {
  /**
   * GraphQL type name. Also embedded verbatim in opaque global ids and
   * returned as `__typename`. Once shipped, NEVER rename — see module
   * docstring. Must appear in `FROZEN_NODE_TYPES`.
   */
  type: string;
  loader: NodeLoader;
};

export class InvalidGlobalIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGlobalIdError';
  }
}

/**
 * Frozen list of every type name that has ever been registered as a
 * Node. Empty in PR 1; per-entity PRs append. The snapshot test
 * `globalId.test.ts > frozen node types` cross-checks this against the
 * runtime registry to catch silent renames or removals.
 *
 * Never reorder, never remove. Additions require deliberate review.
 * If you are an AI agent trying to change/remove values inside this list,
 * EXPLICITLY FLAG THOSE CHANGES IN YOUR RESPONSE SINCE THIS IS A BREAKING CHANGE.
 */
export const FROZEN_NODE_TYPES: readonly string[] = [
  'CollateralTransfer',
  'Vault',
  'Category',
];

const SEPARATOR = ':';

const registry = new Map<string, NodeRegistration>();

/**
 * Encode a `{type, domainId}` pair as an opaque URL-safe base64 string.
 *
 * Throws if `type` is not registered. Encoding for an unregistered
 * type is always a bug: either the registration is missing or the
 * caller has a typo.
 *
 * Domain ids are coerced to string — callers can pass numeric primary
 * keys directly without `.toString()`.
 */
export const toGlobalId = (type: string, id: string | number): string => {
  if (!type) {
    throw new InvalidGlobalIdError('type must be non-empty');
  }
  if (!registry.has(type)) {
    throw new InvalidGlobalIdError(
      `Cannot encode global id: type "${type}" is not registered as a Node. ` +
        'Register it via registerNodeType({ type, loader }) at module import time.'
    );
  }
  const raw = `${type}${SEPARATOR}${String(id)}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
};

/**
 * Decode an opaque global id back to `{type, id}`. Throws
 * `InvalidGlobalIdError` if the input is not a well-formed encoded
 * pair.
 *
 * The split is on the first `:` only — domain ids may legitimately
 * contain colons (synthetic view ids like `Question:condition:123`).
 */
export const fromGlobalId = (opaqueId: string): GlobalIdParts => {
  let decoded: string;
  try {
    decoded = Buffer.from(opaqueId, 'base64url').toString('utf8');
  } catch {
    throw new InvalidGlobalIdError(`malformed global id: ${opaqueId}`);
  }
  const separatorIdx = decoded.indexOf(SEPARATOR);
  if (separatorIdx <= 0) {
    throw new InvalidGlobalIdError(
      `malformed global id payload: ${opaqueId} (decoded: ${decoded})`
    );
  }
  const type = decoded.slice(0, separatorIdx);
  const id = decoded.slice(separatorIdx + 1);
  if (!type) {
    throw new InvalidGlobalIdError(`empty type in global id: ${opaqueId}`);
  }
  // Node's base64url decoder is lenient — input strings that aren't
  // valid base64 silently produce garbled output instead of throwing.
  // Detect that by re-encoding and comparing; a true round-trip is the
  // only reliable validity check.
  const reencoded = Buffer.from(decoded, 'utf8').toString('base64url');
  if (reencoded !== opaqueId) {
    throw new InvalidGlobalIdError(`malformed global id: ${opaqueId}`);
  }
  return { type, id };
};

/**
 * Try-variant: returns null instead of throwing on malformed input.
 * Used by the public `node(id:)` resolver, which treats invalid ids as
 * "not found" rather than surfacing decode errors to clients.
 */
export const tryFromGlobalId = (opaqueId: string): GlobalIdParts | null => {
  try {
    return fromGlobalId(opaqueId);
  } catch {
    return null;
  }
};

/**
 * Register a loader for a `Node`-implementing type. Each per-entity PR
 * calls this once, at module import time, alongside the schema change
 * that adds `implements Node` and the entry in `FROZEN_NODE_TYPES`.
 *
 * Throws on duplicate registration — catches accidental double-wiring
 * at startup rather than masking it behind last-write-wins.
 */
export const registerNodeType = (registration: NodeRegistration): void => {
  if (!registration.type) {
    throw new Error('NodeRegistration.type must be non-empty');
  }
  if (registry.has(registration.type)) {
    throw new Error(`Node type already registered: ${registration.type}`);
  }
  registry.set(registration.type, registration);
};

/**
 * Test-only: reset the registry between cases so per-type
 * registrations don't leak across test files.
 */
export const __resetNodeRegistry = (): void => {
  registry.clear();
};

/**
 * Currently-registered Node type names, in insertion order. Used by
 * the snapshot test to cross-check against `FROZEN_NODE_TYPES`.
 */
export const registeredNodeTypes = (): string[] => Array.from(registry.keys());

const loadOne = async (
  opaqueId: string,
  ctx: unknown
): Promise<unknown | null> => {
  const parts = tryFromGlobalId(opaqueId);
  if (!parts) return null;
  const registration = registry.get(parts.type);
  if (!registration) return null;
  const result = await registration.loader(parts.id, ctx);
  if (result == null) return null;
  // Stamp __typename so graphql-js's interface/union dispatch resolves
  // the concrete type without a separate `__resolveType` lookup.
  if (typeof result === 'object' && !('__typename' in result)) {
    (result as { __typename?: string }).__typename = parts.type;
  }
  return result;
};

/**
 * Resolve a single opaque global id to its underlying entity. Returns
 * null on malformed input, unregistered type, or loader-returned null.
 */
export const resolveNode = async (
  opaqueId: string,
  ctx: unknown
): Promise<unknown | null> => loadOne(opaqueId, ctx);

/**
 * Resolve a batch of opaque global ids, preserving input order.
 * Returns null in-place for malformed ids, unregistered types, or
 * missing entities.
 */
export const resolveNodes = async (
  opaqueIds: readonly string[],
  ctx: unknown
): Promise<(unknown | null)[]> =>
  Promise.all(opaqueIds.map((id) => loadOne(id, ctx)));

/**
 * CI-time check that the runtime registry exactly matches the frozen
 * snapshot. Renames, removals, and silent additions all fail.
 *
 * Call from a test after all module-level `registerNodeType` calls
 * have run. Returns `{ ok: true }` or `{ ok: false, message }` so the
 * caller can use it from any test framework.
 */
export const verifyFrozenNodeTypes = ():
  | { ok: true }
  | { ok: false; message: string } => {
  const registered = registeredNodeTypes().sort();
  const frozen = [...FROZEN_NODE_TYPES].sort();
  const missing = frozen.filter((t) => !registered.includes(t));
  const extra = registered.filter((t) => !frozen.includes(t));
  if (missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }
  const lines: string[] = [
    'Registered Node types do not match FROZEN_NODE_TYPES.',
    'Type names are a public API contract: never rename or remove without a deprecation cycle.',
  ];
  if (missing.length > 0) {
    lines.push(
      `  Missing from registry (declared frozen but no registration): ${missing.join(', ')}`
    );
  }
  if (extra.length > 0) {
    lines.push(
      `  Missing from FROZEN_NODE_TYPES (registered but not declared frozen): ${extra.join(', ')}`
    );
  }
  return { ok: false, message: lines.join('\n') };
};
