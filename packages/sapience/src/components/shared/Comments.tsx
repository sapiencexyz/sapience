'use client';

import { blo } from 'blo';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { FrownIcon } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import { AddressDisplay } from './AddressDisplay';
import LottieLoader from './LottieLoader';
import { useInfiniteForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants/eas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { sqrtPriceX96ToPriceD18, getChainShortName } from '~/lib/utils/util';
import { formatRelativeTime } from '~/lib/utils/timeUtils';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { getSeriesColorByIndex, withAlpha } from '~/lib/theme/chartColors';

// Helper function to check if a market is active
function isMarketActive(market: any): boolean {
  const now = Math.floor(Date.now() / 1000);
  const start = market.startTimestamp;
  const end = market.endTimestamp;

  return (
    market.public &&
    typeof start === 'number' &&
    !Number.isNaN(start) &&
    typeof end === 'number' &&
    !Number.isNaN(end) &&
    now >= start &&
    now < end
  );
}

export enum Answer {
  Yes = 'yes',
  No = 'no',
}

export enum CommentFilters {
  SelectedQuestion = 'selected',
  AllMultichoiceQuestions = 'all-multichoice-questions',
  FilterByAccount = 'my-predictions',
  EconomyFinanceCategory = 'economy-finance',
  DecentralizedComputeCategory = 'decentralized-compute',
  EnergyDePINCategory = 'energy-depin',
  ClimateChangeCategory = 'climate-change',
  GeopoliticsCategory = 'geopolitics',
  BiosecurityCategory = 'tech-science',
  SpaceExplorationCategory = 'space-exploration',
  EmergingTechnologiesCategory = 'emerging-technologies',
  AthleticsCategory = 'athletics',
}

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
  marketClassification?: string;
  optionIndex?: number;
  totalOptions?: number;
  numericValue?: number;
  lowerBound?: number;
  upperBound?: number;
  isActive?: boolean;
  marketAddress?: string;
  marketId?: string;
  chainShortName?: string;
}

interface CommentsProps {
  className?: string;
  question?: string;
  showAllForecasts?: boolean;
  selectedCategory?: CommentFilters | null;
  address?: string | null;
  refetchTrigger?: number;
  marketGroupAddress?: string | null;
  fullBleed?: boolean;
}

// Helper to extract decoded data from attestation, handling .decodedData, .value.value, etc.
function getDecodedDataFromAttestation(att: any): {
  marketAddress: string;
  marketId: number;
  prediction: bigint;
  commentText: string;
} {
  return {
    marketAddress: att.marketAddress,
    marketId: att.marketId,
    prediction: BigInt(att.value),
    commentText: att.comment,
  };
}

// Helper to parse EAS attestation data to Comment type for SCHEMA_UID
function attestationToComment(
  att: any,
  marketGroups: any[] | undefined
): Comment {
  // Schema: address marketAddress, uint256 marketId, uint160 prediction, string comment
  const { marketAddress, marketId, prediction, commentText } =
    getDecodedDataFromAttestation(att);

  // Find the category, question, and marketClassification using marketGroups
  let category: string | undefined = undefined;
  let question: string = marketId?.toString() || '';
  let marketClassification: string | undefined = undefined;
  let baseTokenName: string | undefined = undefined;
  let quoteTokenName: string | undefined = undefined;
  let optionIndex: number | undefined = undefined;
  let totalOptions: number | undefined = undefined;
  let numericValue: number | undefined = undefined;
  let lowerBound: number | undefined = undefined;
  let upperBound: number | undefined = undefined;
  let isActive: boolean = false;
  let chainShortName: string | undefined = undefined;
  if (marketGroups && marketAddress && marketId) {
    const group = marketGroups.find(
      (g) => g.address?.toLowerCase() === marketAddress.toLowerCase()
    );
    if (group) {
      if (group.chainId !== undefined) {
        chainShortName = getChainShortName(group.chainId);
      }
      // Find the market in the group
      const market = group.markets?.find(
        (m: any) => m.marketId?.toString() === marketId?.toString()
      );
      // Check if the market is active
      if (market) {
        isActive = isMarketActive(market);
      }
      if (market && market.question) {
        if (typeof market.question === 'string') {
          question = market.question;
        } else if (market.question.value) {
          question = String(market.question.value);
        } else {
          question = String(market.question);
        }
      }
      if (market && group.category?.slug) {
        category = group.category.slug;
      } else if (group.category?.slug) {
        category = group.category.slug;
      }
      if (group.marketClassification) {
        marketClassification = group.marketClassification;
      }
      if (group.baseTokenName) baseTokenName = group.baseTokenName;
      if (group.quoteTokenName) quoteTokenName = group.quoteTokenName;
      // Multiple choice: find index and total
      if (marketClassification === '1' && group.markets) {
        optionIndex = group.markets.findIndex(
          (m: any) => m.marketId?.toString() === marketId?.toString()
        );
        totalOptions = group.markets.length;
      }
      // Numeric: get value and bounds
      if (marketClassification === '3' && market) {
        numericValue = Number(
          sqrtPriceX96ToPriceD18(prediction) / BigInt(10 ** 36)
        );
        lowerBound =
          market.baseAssetMinPriceTick !== undefined
            ? Number(market.baseAssetMinPriceTick)
            : undefined;
        upperBound =
          market.baseAssetMaxPriceTick !== undefined
            ? Number(market.baseAssetMaxPriceTick)
            : undefined;
      }
    }
  }

  // Format prediction text based on market type
  let predictionText = '';
  let predictionPercent: number | undefined = undefined;
  if (marketClassification === '2') {
    // YES_NO - show percentage chance
    const priceD18 = sqrtPriceX96ToPriceD18(prediction);
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
    const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
    predictionPercent = Math.round(Number(percentageD2) / 100);
    predictionText = `${predictionPercent}% Chance`;
  } else if (marketClassification === '1') {
    // MULTIPLE_CHOICE - show percentage chance for yes/no within multiple choice

    const priceD18 = sqrtPriceX96ToPriceD18(prediction);
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
    const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
    predictionPercent = Math.round(Number(percentageD2) / 100);
    predictionText = `${predictionPercent}% Chance`;
  } else if (marketClassification === '3') {
    // NUMERIC - show numeric value
    const hideQuote = (quoteTokenName || '').toUpperCase().includes('USD');
    const basePart = baseTokenName ? ` ${baseTokenName}` : '';
    const quotePart = !hideQuote && quoteTokenName ? `/${quoteTokenName}` : '';
    predictionText = `${numericValue?.toString()}${basePart}${quotePart}`;
  } else {
    // Fallback
    predictionText = `${numericValue}% Chance`;
  }

  return {
    id: att.id,
    address: att.attester,
    content: commentText,
    timestamp: new Date(Number(att.rawTime) * 1000).toISOString(),
    prediction: predictionText,
    predictionPercent,
    answer: Answer.Yes, // Not available in this schema, default to Yes
    question,
    category,
    marketClassification,
    optionIndex,
    totalOptions,
    numericValue,
    lowerBound,
    upperBound,
    isActive,
    marketAddress,
    marketId: marketId?.toString(),
    chainShortName,
  };
}

const Comments = ({
  className,
  question = undefined,
  selectedCategory: selectedFilter = null,
  address = null,
  refetchTrigger,
  marketGroupAddress,
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
  });

  // Refetch EAS attestations when refetchTrigger changes
  useEffect(() => {
    if (refetch) {
      setTimeout(() => {
        refetch();
      }, 2000);
    }
  }, [refetchTrigger, refetch]);

  // Fetch all market groups for category lookup
  const { data: marketGroups } = useEnrichedMarketGroups
    ? useEnrichedMarketGroups()
    : { data: undefined };

  // Convert EAS attestations to Comment objects with category
  const easComments: Comment[] = (easAttestations || []).map((att) =>
    attestationToComment(att, marketGroups)
  );

  // Filter comments based on selected category and question
  const displayComments = (() => {
    let filtered = easComments;

    // Filter by category if one is selected (but not for 'selected' tab)
    if (
      selectedFilter &&
      selectedFilter !== CommentFilters.SelectedQuestion &&
      selectedFilter !== CommentFilters.FilterByAccount &&
      selectedFilter !== CommentFilters.AllMultichoiceQuestions
    ) {
      filtered = filtered.filter(
        (comment) => comment.category === selectedFilter
      );
    }

    // Filter by address if 'my-predictions' tab is selected

    // Filter by question prop if set (but not for AllMultichoiceQuestions)
    if (
      question &&
      selectedFilter !== null &&
      selectedFilter !== CommentFilters.AllMultichoiceQuestions
    ) {
      filtered = filtered.filter((comment) => {
        return comment.question === question;
      });
    }

    // Filter by marketGroupAddress if AllMultichoiceQuestions is selected
    if (
      selectedFilter === CommentFilters.AllMultichoiceQuestions &&
      marketGroupAddress
    ) {
      filtered = filtered.filter((comment) => {
        return (
          comment.marketAddress?.toLowerCase() ===
          marketGroupAddress.toLowerCase()
        );
      });
    }

    // Sort by timestamp descending (most recent first)
    filtered = filtered
      .slice()
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    // Filter out numeric comments outside the range
    filtered = filtered.filter((comment) => {
      if (
        comment.marketClassification === '3' &&
        comment.numericValue !== undefined &&
        comment.lowerBound !== undefined &&
        comment.upperBound !== undefined
      ) {
        const min = tickToPrice(comment.lowerBound);
        const max = tickToPrice(comment.upperBound);
        const val = comment.numericValue;
        return val >= min && val <= max;
      }
      return true;
    });

    // Filter out inactive comments
    filtered = filtered.filter((comment) => {
      // For attestation comments (from EAS), check if the market is active
      return comment.isActive !== false;
    });

    return filtered;
  })();

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

  return (
    <div className={`${className || ''}`}>
      {selectedFilter === CommentFilters.SelectedQuestion && !question && (
        <div className="text-center text-muted-foreground py-16">
          <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
          No forecasts found
        </div>
      )}
      {!(selectedFilter === CommentFilters.SelectedQuestion && !question) && (
        <>
          {isEasLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <LottieLoader width={32} height={32} />
            </div>
          ) : displayComments.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
              No forecasts found
            </div>
          ) : (
            <>
              {displayComments.map((comment, idx) => {
                const isLast = idx === displayComments.length - 1;
                return (
                  <div
                    key={comment.id}
                    ref={isLast ? lastItemRef : undefined}
                    className={`relative border-t border-border ${fullBleed ? '-mx-4' : ''}`}
                  >
                    <div className="relative">
                      <div
                        className={`${fullBleed ? 'px-10' : 'px-6'} py-5 space-y-4`}
                      >
                        {/* Question and Prediction */}
                        <div className="space-y-3">
                          <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] flex items-center gap-2">
                            {comment.marketAddress && comment.marketId ? (
                              <Link
                                href={`/markets/${comment.chainShortName || 'base'}:${comment.marketAddress.toLowerCase()}/${comment.marketId}`}
                                className="group"
                              >
                                <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                                  {comment.question}
                                </span>
                              </Link>
                            ) : (
                              comment.question
                            )}
                          </h2>
                          {/* Prediction, time, and signature layout */}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              {/* Prediction badge/text based on market type */}
                              {comment.prediction &&
                                (() => {
                                  // Multiple-choice: color by option index using series colors
                                  if (
                                    comment.marketClassification === '1' &&
                                    typeof comment.optionIndex === 'number'
                                  ) {
                                    const color = getSeriesColorByIndex(
                                      comment.optionIndex
                                    );
                                    const bg = withAlpha(color, 0.08);
                                    const border = withAlpha(color, 0.24);
                                    return (
                                      <Badge
                                        variant={'outline' as any}
                                        style={{
                                          backgroundColor: bg,
                                          borderColor: border,
                                          color,
                                        }}
                                      >
                                        {comment.prediction}
                                      </Badge>
                                    );
                                  }

                                  // Yes/No: retain red/green based on >/< 50%
                                  const isNumericMarket =
                                    comment.marketClassification === '3';
                                  const percent = comment.predictionPercent;
                                  const shouldColor =
                                    !isNumericMarket &&
                                    typeof percent === 'number' &&
                                    percent !== 50;
                                  const isGreen = shouldColor && percent > 50;
                                  const isRed = shouldColor && percent < 50;
                                  const variant = shouldColor
                                    ? 'outline'
                                    : 'default';
                                  const className = shouldColor
                                    ? isGreen
                                      ? 'border-green-500/40 bg-green-500/10 text-green-600'
                                      : isRed
                                        ? 'border-red-500/40 bg-red-500/10 text-red-600'
                                        : ''
                                    : '';
                                  return (
                                    <Badge
                                      variant={variant as any}
                                      className={className}
                                    >
                                      {comment.prediction}
                                    </Badge>
                                  );
                                })()}
                              {/* Time */}
                              <span className="text-sm text-muted-foreground/70 font-medium">
                                {formatRelativeTime(
                                  new Date(comment.timestamp).getTime()
                                )}
                              </span>
                            </div>
                            {/* Address display - right justified on larger screens, moved below content on mobile */}
                            <div className="hidden sm:flex items-center gap-2">
                              <div className="relative">
                                <Image
                                  alt={comment.address}
                                  src={blo(comment.address as `0x${string}`)}
                                  className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                                  width={20}
                                  height={20}
                                />
                              </div>
                              <div className="text-sm text-muted-foreground/80 font-medium">
                                <AddressDisplay
                                  address={comment.address}
                                  disableProfileLink={false}
                                  className="text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Comment content */}
                        {(comment.content || '').trim().length > 0 && (
                          <div className="border border-muted-foreground/40 rounded shadow-lg bg-background/50 dark:bg-muted/50 overflow-hidden p-4">
                            <div className="text-xl leading-[1.5] text-foreground/90 tracking-[-0.005em]">
                              {comment.content}
                            </div>
                          </div>
                        )}
                        {/* Address display below content on mobile */}
                        <div className="mt-2 flex items-center gap-2 sm:hidden">
                          <div className="relative">
                            <Image
                              alt={comment.address}
                              src={blo(comment.address as `0x${string}`)}
                              className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                              width={20}
                              height={20}
                            />
                          </div>
                          <div className="text-sm text-muted-foreground/80 font-medium">
                            <AddressDisplay
                              address={comment.address}
                              disableProfileLink={false}
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isFetchingNextPage && (
                <div className="flex flex-col items-center justify-center py-6">
                  <LottieLoader width={32} height={32} />
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
