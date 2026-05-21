/**
 * `Query.questions` — the original bare `questions(...flat-args)`
 * resolver, renamed to free the canonical `questions` name for the
 * Relay-shaped connection while honoring the doc's one-release
 * deprecation window. Delegates to the shared `runQuestions` runner
 * (which is now decoupled from any one Query<Field>Args shape).
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import { runQuestions } from '../questions';

export const questions: NonNullable<QueryResolvers['questions']> = async (
  _parent,
  args
) => {
  logDeprecatedHit('questions');
  const { items } = await runQuestions({
    take: args.take,
    skip: args.skip,
    search: args.search ?? null,
    categorySlugs: args.categorySlugs ?? null,
    tag: args.tag ?? null,
    chainId: args.chainId ?? null,
    contractAddress: null,
    contractAddressIn: null,
    minEndTime: args.minEndTime ?? null,
    resolutionStatus: args.resolutionStatus ?? null,
    minEstimatedPrice: args.minEstimatedPrice ?? null,
    maxEstimatedPrice: args.maxEstimatedPrice ?? null,
    minSimilarMarketVolume: args.minSimilarMarketVolume ?? null,
    maxSimilarMarketVolume: args.maxSimilarMarketVolume ?? null,
    similarMarketVolumeWindow: args.similarMarketVolumeWindow ?? null,
    sortField: args.sortField ?? null,
    sortDirection: args.sortDirection ?? null,
  });
  return items;
};
