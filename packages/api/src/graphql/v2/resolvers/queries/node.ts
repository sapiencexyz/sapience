/**
 * v2 `node(id:)` / `nodes(ids:)` — Relay polymorphic refetch.
 *
 * Mirrors v1's resolver but dispatches against the v2-scoped registry
 * (`../../relay/nodeRegistry.ts`) so v1 and v2 endpoints can coexist
 * with overlapping type names.
 */

import { resolveNodeV2, resolveNodesV2 } from '../../relay/nodeRegistry';

export const node = async (
  _parent: unknown,
  { id }: { id: string },
  ctx: unknown
) => resolveNodeV2(id, ctx);

export const nodes = async (
  _parent: unknown,
  { ids }: { ids: string[] },
  ctx: unknown
) => resolveNodesV2(ids, ctx);
