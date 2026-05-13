/**
 * Deprecated bare-array form of questions. Replaced by `questionsPage`.
 * Logic lives in `runQuestions` in the live file.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { runQuestions } from '../questions';

export const questions: NonNullable<QueryResolvers['questions']> = async (
  _parent,
  args
) => {
  const { items } = await runQuestions(args);
  return items;
};
