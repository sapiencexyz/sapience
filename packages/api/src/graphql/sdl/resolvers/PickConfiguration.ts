/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PickConfigurationResolvers } from '../__generated__/resolvers';
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

export const PickConfiguration: PickConfigurationResolvers = {
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
