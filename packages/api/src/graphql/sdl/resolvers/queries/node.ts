/**
 * `node(id:)` / `nodes(ids:)` — Relay-style polymorphic refetch.
 *
 * Decodes an opaque global id, dispatches to the loader registered for
 * its type, and stamps `__typename` so graphql-js's interface dispatch
 * resolves the concrete `Node` implementor without a separate
 * `__resolveType`. Returns `null` for malformed ids, unregistered types,
 * or missing entities — the contract is "treat any failure to resolve
 * as not-found," not "surface decode errors to clients."
 *
 * PR 1 ships this dispatch surface against an empty registry; per-entity
 * PRs (Account, Condition, Trade, etc.) call `registerNodeType` at
 * import time alongside the schema change that adds `implements Node`.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import { resolveNode, resolveNodes } from '../../../relay/globalId';

type NodeResolver = NonNullable<QueryResolvers['node']>;
type NodesResolver = NonNullable<QueryResolvers['nodes']>;

export const node: NodeResolver = (async (_parent, { id }, ctx) =>
  resolveNode(id, ctx)) as NodeResolver;

export const nodes: NodesResolver = (async (_parent, { ids }, ctx) =>
  resolveNodes(ids, ctx)) as NodesResolver;
