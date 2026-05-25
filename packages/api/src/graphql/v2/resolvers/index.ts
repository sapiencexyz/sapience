/**
 * Resolver map for the v2 schema.
 *
 * Currently stub-only — only the foundation surface (`node`, `nodes`,
 * `_v2Health`) plus the scalar resolvers v2 shares with v1. Each
 * per-entity phase appends to this map alongside the SDL change that
 * introduces the type.
 */

import { scalarResolvers } from '../../sdl/resolvers/scalars';
import { node, nodes } from './queries/node';

// Project the shared scalar map down to the scalars actually declared in
// v2's SDL. `makeExecutableSchema` warns when the resolver map mentions
// types the schema doesn't define, and v2 starts with a narrower scalar
// set than v1.
const { Address, BigInt, DateTimeISO, UnixSeconds } = scalarResolvers;

export const resolvers = {
  Address,
  BigInt,
  DateTimeISO,
  UnixSeconds,
  Query: {
    node,
    nodes,
    _v2Health: () => ({
      status: 'ok',
      schemaVersion: 'v2.0.0-stub',
    }),
  },
};
