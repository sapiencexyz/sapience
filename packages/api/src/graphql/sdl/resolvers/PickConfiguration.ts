/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PickConfigurationResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { registerNodeType, toGlobalId } from '../../relay/globalId';
import { mapPickConfig } from './pickConfigHelpers';
import { predictionsConnection, positionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';

const idOf = (parent: unknown): string =>
  String((parent as { id?: string }).id ?? '').toLowerCase();
const tokensOf = (parent: unknown): string[] =>
  [
    (parent as { predictorToken?: string | null }).predictorToken,
    (parent as { counterpartyToken?: string | null }).counterpartyToken,
  ]
    .filter(Boolean)
    .map((t) => t!.toLowerCase());

registerNodeType({
  type: 'PickConfiguration',
  loader: async (id, ctx) => {
    const pickConfigId = id.toLowerCase();
    const loaders = (
      ctx as {
        loaders?: {
          pickConfigById?: {
            load: (id: string) => Promise<unknown | null>;
          };
        };
      }
    ).loaders;
    const row = loaders?.pickConfigById
      ? await loaders.pickConfigById.load(pickConfigId)
      : await prisma.picks.findUnique({
          where: { id: pickConfigId },
          include: { picks: true },
        });
    return row
      ? mapPickConfig(row as Parameters<typeof mapPickConfig>[0])
      : null;
  },
});

export const PickConfiguration: PickConfigurationResolvers = {
  id: (parent) => toGlobalId('PickConfiguration', idOf(parent)),
  pickConfigId: (parent) => idOf(parent),

  predictions: (parent, args, ctx, info) =>
    (predictionsConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), pickConfigId: idOf(parent) },
      },
      ctx,
      info
    ),

  trades: (parent, args, ctx, info) =>
    (tradesConnection as any)(
      parent,
      { ...args, filter: { ...(args.filter ?? {}), tokens: tokensOf(parent) } },
      ctx,
      info
    ),

  positions: (parent, args, ctx, info) =>
    (positionsConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), pickConfigId: idOf(parent) },
      },
      ctx,
      info
    ),
};
