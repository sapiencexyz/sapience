/**
 * QuestionsPage field resolvers.
 *
 * `totalCount` is null by default — the questions query unions
 * ConditionGroup and Condition rows via raw SQL, so a precise total is
 * non-trivial to compute. Callers that need a count today should fetch
 * an unbounded page; surfacing a true count is a future enhancement.
 */

import type { QuestionsPageResolvers } from '../__generated__/resolvers';

type QuestionsPageParent = {
  totalCount?: number | null;
};

export const QuestionsPage: QuestionsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as QuestionsPageParent;
    return typeof p.totalCount === 'number' ? p.totalCount : null;
  },
};
