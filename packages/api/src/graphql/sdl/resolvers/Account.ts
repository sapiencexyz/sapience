/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Account field resolvers. Every Account! reference is synthesized through
 * accountSynthesis.ts when no User row exists; child feeds scope by canonical
 * lowercased EVM address.
 */

import type { AccountResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { toGlobalId } from '../../relay/globalId';
import { encodeCursor, decodeCursor } from '../../relay/cursor';
import { synthesizeAccount } from './accountSynthesis';
import { predictionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';
import { forecastsConnection } from './queries/crud';
import { positionsConnection } from './queries/escrow';
import { collateralBalance } from './queries/collateralBalance';
import { accountStats } from './queries/accountStats';
import { rankedAccountsForMetric } from './queries/pr6';

const addressOf = (parent: unknown): string =>
  ((parent as { address?: string }).address ?? '').toLowerCase();

type PrismaUser = {
  id: number;
  referredById?: number | null;
  referredByCodeId?: number | null;
};

export const Account: AccountResolvers = {
  id: (parent) => toGlobalId('Account', addressOf(parent)),

  referredBy: async (parent, _args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredById == null) return null;
    return ctx.loaders!.userById.load(p.referredById);
  },

  referredByCode: async (parent, _args, ctx) => {
    const p = parent as PrismaUser;
    if (p.referredByCodeId == null) return null;
    return ctx.loaders!.referralCodeById.load(p.referredByCodeId);
  },

  referrals: async (parent) => {
    const p = parent as PrismaUser;
    if (p.id == null) return [];
    return prisma.user.findMany({ where: { referredById: p.id } });
  },

  predictions: (parent, args, ctx, info) =>
    (predictionsConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), address: addressOf(parent) },
      },
      ctx,
      info
    ),

  trades: (parent, args, ctx, info) =>
    (tradesConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), address: addressOf(parent) },
      },
      ctx,
      info
    ),

  forecasts: (parent, args, ctx, info) =>
    (forecastsConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), forecaster: addressOf(parent) },
      },
      ctx,
      info
    ),

  positions: (parent, args, ctx, info) =>
    (positionsConnection as any)(
      parent,
      {
        ...args,
        filter: { ...(args.filter ?? {}), holder: addressOf(parent) },
      },
      ctx,
      info
    ),

  collateralBalance: (parent, args, ctx, info) =>
    (collateralBalance as any)(
      parent,
      { ...args, address: addressOf(parent) },
      ctx,
      info
    ),

  stats: async (parent, args) => {
    const rows = await (accountStats as any)(null, {
      address: addressOf(parent),
      from:
        (args.filter?.timestamp as { gte?: number | null } | null)?.gte ?? null,
      to:
        (args.filter?.timestamp as { lte?: number | null } | null)?.lte ?? null,
      fromEpoch: null,
      toEpoch: null,
    });
    const afterPayload = args.after ? decodeCursor(args.after) : null;
    const start = afterPayload ? Number(afterPayload.k) + 1 : 0;
    const first = Math.min(args.first ?? 50, 100);
    const pageRows = rows.slice(start, start + first).map((r: any) => ({
      ...r,
      account: synthesizeAccount(addressOf(parent)),
    }));
    const edges = pageRows.map((node: any, index: number) => ({
      node,
      cursor: encodeCursor({
        k: String(start + index),
        id: String(node.timestamp),
      }),
    }));
    return {
      nodes: pageRows,
      edges,
      pageInfo: {
        hasNextPage: start + pageRows.length < rows.length,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
    };
  },

  rank: async (parent, args) => {
    const address = addressOf(parent);
    const ranked = await rankedAccountsForMetric(
      args.metric,
      args.filter ?? null
    );
    const index = ranked.findIndex(
      (entry) => entry.address.toLowerCase() === address
    );
    if (index < 0) return null;
    return {
      account: synthesizeAccount(address) as never,
      rank: index + 1,
      value: ranked[index].value,
    };
  },
};
