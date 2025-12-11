'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { AddressDisplay } from './AddressDisplay';
import Loader from './Loader';
import { useInfiniteForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants';
import { d18ToPercentage } from '~/lib/utils/util';
import { formatRelativeTime } from '~/lib/utils/timeUtils';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { formatPercentChance } from '~/lib/format/percentChance';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';
import { getFocusAreaMap } from '~/lib/constants/focusAreas';

export enum Answer {
  Yes = 'yes',
  No = 'no',
}

export enum CommentFilters {
  SelectedQuestion = 'selected',
  FilterByAccount = 'my-predictions',
  EconomyFinanceCategory = 'economy-finance',
  DecentralizedComputeCategory = 'crypto',
  EnergyDePINCategory = 'energy-depin',
  ClimateChangeCategory = 'weather',
  GeopoliticsCategory = 'geopolitics',
  BiosecurityCategory = 'tech-science',
  SpaceExplorationCategory = 'space-exploration',
  EmergingTechnologiesCategory = 'emerging-technologies',
  AthleticsCategory = 'sports',
}

type ConditionData = {
  id: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  description?: string | null;
  category?: { slug?: string | null } | null;
};

interface Comment {
  id: string;
  address: string;
  content: string;
  timestamp: string;
  prediction?: string;
  predictionPercent?: number;
  question: string;
  category?: string;
  answer: Answer;
  conditionId?: string;
  endTime?: number | null;
  description?: string | null;
}

interface CommentsProps {
  className?: string;
  question?: string;
  conditionId?: string;
  showAllForecasts?: boolean;
  selectedCategory?: CommentFilters | null;
  address?: string | null;
  refetchTrigger?: number;
  fullBleed?: boolean;
}

// Helper to extract decoded data from attestation
function getDecodedDataFromAttestation(att: any): {
  prediction: bigint;
  commentText: string;
} {
  return {
    prediction: BigInt(att.value),
    commentText: att.comment,
  };
}

// Helper to parse EAS attestation data to Comment type
function attestationToComment(
  att: any,
  conditionsMap: Record<string, ConditionData> | undefined,
  isConditionsLoading: boolean
): Comment {
  const { prediction, commentText } = getDecodedDataFromAttestation(att);

  // Extract questionId from the attestation
  const questionId = att.questionId;

  // Find the condition data using questionId
  let category: string | undefined = undefined;
  let question: string = isConditionsLoading
    ? 'Loading question...'
    : 'Unknown question';
  let endTime: number | null | undefined = undefined;
  let description: string | null | undefined = undefined;

  // Look up condition by questionId
  const isZeroQuestionId =
    !questionId ||
    questionId ===
      '0x0000000000000000000000000000000000000000000000000000000000000000';

  if (!isZeroQuestionId && conditionsMap && questionId) {
    const condition = conditionsMap[questionId.toLowerCase()];
    if (condition) {
      question = condition.shortName || condition.question;
      category = condition.category?.slug || undefined;
      endTime = condition.endTime;
      description = condition.description;
    }
  }

  // Format prediction text - all condition forecasts are YES_NO
  // prediction is in D18 format: percentage * 10^18
  let predictionText = '';
  let predictionPercent: number | undefined = undefined;

  predictionPercent = Math.round(d18ToPercentage(prediction));
  const prob = Number.isFinite(predictionPercent)
    ? Number(predictionPercent) / 100
    : NaN;
  predictionText = `${formatPercentChance(prob)} Chance`;

  return {
    id: att.id,
    address: att.attester,
    content: commentText,
    timestamp: new Date(Number(att.rawTime) * 1000).toISOString(),
    prediction: predictionText,
    predictionPercent,
    answer: Answer.Yes,
    question,
    category,
    conditionId: isZeroQuestionId ? undefined : questionId,
    endTime,
    description,
  };
}

const Comments = ({
  className,
  question = undefined,
  conditionId,
  selectedCategory: selectedFilter = null,
  address = null,
  refetchTrigger,
  fullBleed = false,
}: CommentsProps) => {
  // Fetch EAS attestations
  const shouldFilterByAttester =
    selectedFilter === CommentFilters.FilterByAccount &&
    address &&
    typeof address === 'string' &&
    address.length > 0;
  const {
    data: easAttestations,
    isLoading: isEasLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteForecasts({
    schemaId: SCHEMA_UID,
    attesterAddress: shouldFilterByAttester ? address : undefined,
    conditionId: conditionId,
  });

  // Refetch EAS attestations when refetchTrigger changes
  useEffect(() => {
    if (refetch) {
      setTimeout(() => {
        refetch();
      }, 2000);
    }
  }, [refetchTrigger, refetch]);

  // Collect unique conditionIds from attestations for batch fetching
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    for (const att of easAttestations || []) {
      const questionId = att.questionId;
      if (
        questionId &&
        typeof questionId === 'string' &&
        questionId.startsWith('0x') &&
        questionId !==
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
        set.add(questionId.toLowerCase());
      }
    }
    return Array.from(set);
  }, [easAttestations]);

  // Fetch condition details for the attestations
  const { data: conditionsMap, isLoading: isConditionsLoading } = useQuery<
    Record<string, ConditionData>
  >({
    queryKey: ['conditionsByIds', conditionIds.sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const query = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]) {
          conditions(where: { id: { in: $ids } }) {
            id
            question
            shortName
            endTime
            description
            category {
              slug
            }
          }
        }
      `;
      type Result = {
        conditions: ConditionData[];
      };
      const res = await graphqlRequest<Result>(query, { ids: conditionIds });
      const map: Record<string, ConditionData> = {};
      for (const c of res.conditions || []) {
        map[c.id.toLowerCase()] = c;
      }
      return map;
    },
  });

  // Convert EAS attestations to Comment objects with category
  const easComments: Comment[] = useMemo(
    () =>
      (easAttestations || []).map((att) =>
        attestationToComment(att, conditionsMap, isConditionsLoading)
      ),
    [easAttestations, conditionsMap, isConditionsLoading]
  );

  // Filter comments based on selected category and question
  const displayComments = useMemo(() => {
    let filtered = easComments;

    // Filter by category if one is selected (but not for 'selected' tab or account filter)
    if (
      selectedFilter &&
      selectedFilter !== CommentFilters.SelectedQuestion &&
      selectedFilter !== CommentFilters.FilterByAccount
    ) {
      filtered = filtered.filter(
        (comment) => comment.category === selectedFilter
      );
    }

    // Filter by question prop if set
    if (question && selectedFilter !== null) {
      filtered = filtered.filter((comment) => {
        return comment.question === question;
      });
    }

    // Sort by timestamp descending (most recent first)
    filtered = filtered
      .slice()
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    return filtered;
  }, [easComments, selectedFilter, question]);

  // Infinite scroll: observe the last rendered comment
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      if (!hasNextPage) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            fetchNextPage();
          }
        },
        { root: null, rootMargin: '200px', threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage]
  );

  const isLoading = isEasLoading || isConditionsLoading;

  // Get focus area map for category colors
  const focusAreaMap = useMemo(() => getFocusAreaMap(), []);

  return (
    <div className={`${className || ''}`}>
      {selectedFilter === CommentFilters.SelectedQuestion && !question && null}
      {!(selectedFilter === CommentFilters.SelectedQuestion && !question) && (
        <>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader size={16} />
            </div>
          ) : displayComments.length === 0 ? null : (
            <>
              {displayComments.map((comment, idx) => {
                const isLast = idx === displayComments.length - 1;
                const hasText = (comment.content || '').trim().length > 0;
                return (
                  <div
                    key={comment.id}
                    ref={isLast ? lastItemRef : undefined}
                    className={`relative border-t border-border ${fullBleed ? '-mx-4' : ''}`}
                  >
                    <div className="relative">
                      <div
                        className={`${fullBleed ? 'px-10' : 'px-6'} py-5 ${hasText ? 'space-y-4' : 'space-y-3'}`}
                      >
                        {/* Question with category icon */}
                        <div className="flex items-start gap-2.5">
                          {comment.category && (
                            <MarketBadge
                              label={comment.question}
                              size={28}
                              color={focusAreaMap.get(comment.category)?.color}
                              categorySlug={comment.category}
                            />
                          )}
                          <div className="flex-grow min-w-0">
                            {comment.conditionId ? (
                              <ConditionTitleLink
                                conditionId={comment.conditionId}
                                title={comment.question}
                                endTime={comment.endTime}
                                description={comment.description}
                                className="font-medium"
                                clampLines={null}
                              />
                            ) : (
                              <div className="font-mono font-medium text-brand-white underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 transition-colors break-words whitespace-normal">
                                {comment.question}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Comment content */}
                        {(comment.content || '').trim().length > 0 && (
                          <div className="border border-foreground/30 rounded shadow-md bg-background overflow-hidden p-4">
                            <div className="text-xl leading-[1.5] text-foreground/90 tracking-[-0.005em]">
                              {comment.content}
                            </div>
                          </div>
                        )}
                        {/* Unified meta row: chance badge, time, address */}
                        <div
                          className={`${hasText ? 'mt-2' : '-mt-1.5'} flex flex-wrap items-center gap-3`}
                        >
                          {comment.prediction &&
                            (() => {
                              const percent = comment.predictionPercent;
                              const baseClasses =
                                'px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 uppercase font-mono';

                              let variant: 'default' | 'outline' = 'default';
                              let className = baseClasses;

                              if (
                                typeof percent === 'number' &&
                                percent !== 50
                              ) {
                                variant = 'outline';
                                className =
                                  baseClasses +
                                  (percent > 50
                                    ? ' border-yes/40 bg-yes/10 text-yes'
                                    : ' border-no/40 bg-no/10 text-no');
                              }

                              return (
                                <Badge
                                  variant={variant as any}
                                  className={className}
                                >
                                  {comment.prediction}
                                </Badge>
                              );
                            })()}
                          <span className="text-sm text-muted-foreground/70 font-medium font-mono">
                            {formatRelativeTime(
                              new Date(comment.timestamp).getTime()
                            )}
                          </span>
                          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                            <div className="relative translate-y-[1px]">
                              <EnsAvatar
                                address={comment.address}
                                className="w-3.5 h-3.5 rounded-sm ring-1 ring-border/50"
                                width={14}
                                height={14}
                              />
                            </div>
                            <div className="text-[12px] text-muted-foreground/80 font-medium">
                              <AddressDisplay
                                address={comment.address}
                                disableProfileLink={false}
                                compact
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isFetchingNextPage && (
                <div className="flex flex-col items-center justify-center py-6">
                  <Loader size={12} />
                </div>
              )}
              {!hasNextPage && <div className="py-4" />}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Comments;
