/**
 * Attestation model resolvers. Relation names match between Prisma
 * and SDL: `condition` (single), `attestationScore` (single).
 *
 * `condition` rides the existing `conditionById` DataLoader — same
 * loader the Pick.condition resolver uses. The loader pre-warms
 * `category`, so a downstream `Condition.category` doesn't N+1 either.
 * The legacy `where: ConditionWhereInput` arg on the SDL is vestigial
 * (no caller filters a single relation) — when it's present, fall
 * through to the per-row path to preserve filter semantics.
 */

import type { AttestationResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaAttestation = {
  id: number;
  time: number;
  conditionId?: string | null;
  condition?: unknown;
  [k: string]: unknown;
};

export const Attestation: AttestationResolvers = {
  attestedAt: (parent) => (parent as PrismaAttestation).time,

  condition: async (parent, args, ctx) => {
    const p = parent as PrismaAttestation;
    if (p.condition !== undefined) return p.condition as never;
    if (p.conditionId == null) return null;
    if (ctx.loaders && (!args || args.where == null)) {
      return ctx.loaders.conditionById.load(p.conditionId) as never;
    }
    return loadRelation(p, 'condition', {
      parentModel: 'attestation',
      parentWhere: { id: p.id },
      prismaRelationName: 'condition',
      args,
    });
  },

  attestationScore: async (parent, args) =>
    loadRelation(parent as PrismaAttestation, 'attestationScore', {
      parentModel: 'attestation',
      parentWhere: { id: (parent as PrismaAttestation).id },
      prismaRelationName: 'attestationScore',
      args,
    }),
};
