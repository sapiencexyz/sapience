/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Field resolvers for the derived `Question` view.
 *
 * `Question` wraps either a `Condition` or a `ConditionGroup`. The
 * `runQuestions` runner shapes parent rows as either
 *   { questionType: 'condition', condition, group: null, predictionCount }
 * or
 *   { questionType: 'group',     condition: null, group, predictionCount }
 *
 * The new `source` union and forwarded fields below read whichever side
 * is populated; legacy `condition`, `group`, `predictionCount`, and
 * `questionType` fall through to the default resolver because they
 * already exist on the parent shape.
 *
 * Note: `ConditionOrConditionGroup.__resolveType` is registered on the
 * union itself (see `ConditionOrConditionGroup` export below). The
 * discriminator is the presence of `id: string` (Condition; varchar PK)
 * vs `id: number` (ConditionGroup; autoincrement int).
 */

import type {
  QuestionResolvers,
  ConditionOrConditionGroupResolvers,
} from '../__generated__/resolvers';
import { predictionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';
import { forecastsConnection } from './queries/crud';
import { activity } from './queries/pr6';

type QuestionParent = {
  questionType: 'condition' | 'group';
  condition: { [k: string]: unknown; id?: string } | null;
  group: { [k: string]: unknown; id?: number } | null;
  predictionCount?: number | null;
};

const subject = (parent: QuestionParent) =>
  parent.questionType === 'condition' ? parent.condition : parent.group;

const fromCondition = <T>(
  parent: QuestionParent,
  key: string,
  fallback: T | null = null
): T | null => {
  if (parent.questionType !== 'condition' || !parent.condition) return fallback;
  const value = (parent.condition as Record<string, unknown>)[key];
  return value === undefined ? fallback : (value as T);
};

const fromGroup = <T>(
  parent: QuestionParent,
  key: string,
  fallback: T | null = null
): T | null => {
  if (parent.questionType !== 'group' || !parent.group) return fallback;
  const value = (parent.group as Record<string, unknown>)[key];
  return value === undefined ? fallback : (value as T);
};

export const Question: QuestionResolvers = {
  source: (parent) => {
    const p = parent as QuestionParent;
    const s = subject(p);
    return s as never;
  },

  title: (parent) => {
    const p = parent as QuestionParent;
    if (p.questionType === 'condition') {
      return (fromCondition<string>(p, 'question') ?? '') as string;
    }
    return (fromGroup<string>(p, 'name') ?? '') as string;
  },

  description: (parent) => {
    const p = parent as QuestionParent;
    return p.questionType === 'condition'
      ? fromCondition<string>(p, 'description')
      : null;
  },

  category: (parent) => {
    const p = parent as QuestionParent;
    return (
      p.questionType === 'condition'
        ? fromCondition<unknown>(p, 'category')
        : fromGroup<unknown>(p, 'category')
    ) as never;
  },

  tags: (parent) => {
    const p = parent as QuestionParent;
    if (p.questionType === 'condition') {
      return (fromCondition<string[]>(p, 'tags') ?? []) as string[];
    }
    return [];
  },

  openInterest: (parent) => {
    const p = parent as QuestionParent;
    if (p.questionType === 'condition') {
      return fromCondition<string>(p, 'openInterest');
    }
    const raw = fromGroup<unknown>(p, 'totalOpenInterest');
    return raw == null ? null : String(raw);
  },

  volume: (parent) => {
    const p = parent as QuestionParent;
    if (p.questionType === 'condition') {
      return fromCondition<number>(p, 'similarMarketVolume24h');
    }
    const raw = fromGroup<unknown>(p, 'totalSimilarMarketVolume24h');
    return raw == null ? null : Number(raw);
  },

  createdAt: (parent) => {
    const p = parent as QuestionParent;
    const raw =
      p.questionType === 'condition'
        ? fromCondition<Date>(p, 'createdAt')
        : fromGroup<Date>(p, 'createdAt');
    return raw as Date;
  },


  predictions: (parent, args, ctx, info) => {
    const p = parent as QuestionParent;
    if (p.questionType !== 'condition' || !p.condition?.id) {
      return { edges: [], nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null } } as never;
    }
    return (predictionsConnection as any)(parent, { ...args, filter: { ...(args.filter ?? {}), conditionId: p.condition.id } }, ctx, info);
  },

  trades: (parent, args, ctx, info) => {
    return (tradesConnection as any)(parent, args, ctx, info);
  },

  forecasts: (parent, args, ctx, info) => {
    const p = parent as QuestionParent;
    if (p.questionType !== 'condition' || !p.condition?.id) {
      return { edges: [], nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null } } as never;
    }
    return (forecastsConnection as any)(parent, { ...args, filter: { ...(args.filter ?? {}), conditionId: p.condition.id } }, ctx, info);
  },

  activity: (parent, args, ctx, info) => {
    const p = parent as QuestionParent;
    if (p.questionType !== 'condition' || !p.condition?.id) {
      return { edges: [], nodes: [], pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null } } as never;
    }
    return (activity as any)(parent, { ...args, filter: { ...(args.filter ?? {}), conditionId: p.condition.id } }, ctx, info);
  },

  resolvesAt: (parent) => {
    const p = parent as QuestionParent;
    if (p.questionType === 'condition') {
      return fromCondition<number>(p, 'endTime');
    }
    return fromGroup<number>(p, 'maxEndTime');
  },
};

/**
 * `ConditionOrConditionGroup` union — Apollo needs `__resolveType` to
 * pick the right branch. The two types have disjoint primary-key types
 * (string varchar vs autoincrement int), so the `typeof id` check is
 * both stable and cheap.
 */
export const ConditionOrConditionGroup: ConditionOrConditionGroupResolvers = {
  __resolveType: (parent) => {
    const id = (parent as { id: unknown }).id;
    return typeof id === 'number' ? 'ConditionGroup' : 'Condition';
  },
};
