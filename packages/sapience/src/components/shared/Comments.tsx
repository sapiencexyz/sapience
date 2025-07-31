'use client';

import { blo } from 'blo';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@sapience/ui/components/ui/badge';
import { AddressDisplay } from './AddressDisplay';
import LottieLoader from './LottieLoader';
import { usePredictions } from '~/hooks/graphql/usePredictions';
import { CONVERGE_SCHEMA_UID } from '~/lib/constants/eas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import { formatRelativeTime } from '~/lib/utils/timeUtils';

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

export enum SelectableTab {
  Selected = 'selected',
  MyPredictions = 'my-predictions',
  EconomyFinance = 'economy-finance',
  DecentralizedCompute = 'decentralized-compute',
  EnergyDePIN = 'energy-depin',
  ClimateChange = 'climate-change',
  Geopolitics = 'geopolitics',
  Biosecurity = 'biosecurity',
  SpaceExploration = 'space-exploration',
  EmergingTechnologies = 'emerging-technologies',
  Athletics = 'athletics',
}

interface Comment {
  id: string;
  address: string;
  content: string;
  timestamp: string;
  prediction?: string;
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
}

interface CommentsProps {
  className?: string;
  question?: string;
  showAllForecasts?: boolean;
  selectedCategory?: SelectableTab | null;
  address?: string | null;
  refetchTrigger?: number;
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
  if (marketGroups && marketAddress && marketId) {
    const group = marketGroups.find(
      (g) => g.address?.toLowerCase() === marketAddress.toLowerCase()
    );
    if (group) {
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
  if (marketClassification === '2') {
    // YES_NO - show percentage chance
    const priceD18 = sqrtPriceX96ToPriceD18(prediction);
    const percentage = (Number(priceD18) / 10 ** 18) * 100;
    predictionText = `${Math.round(percentage)}% Chance`;
  } else if (marketClassification === '1') {
    // MULTIPLE_CHOICE - show percentage chance for yes/no within multiple choice
    const priceD18 = sqrtPriceX96ToPriceD18(prediction);
    const percentage = (Number(priceD18) / 10 ** 18) * 100;
    predictionText = `${Math.round(percentage)}% Chance`;
  } else if (marketClassification === '3') {
    // NUMERIC - show numeric value
    predictionText = `${numericValue?.toString()}${baseTokenName ? ' ' + baseTokenName : ''}${quoteTokenName ? '/' + quoteTokenName : ''}`;
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
  };
}

const Comments = ({
  className,
  question = undefined,
  selectedCategory = null,
  address = null,
  refetchTrigger,
}: CommentsProps) => {
  // Fetch EAS attestations
  const shouldFilterByAttester =
    selectedCategory === SelectableTab.MyPredictions &&
    address &&
    typeof address === 'string' &&
    address.length > 0;
  const {
    data: easAttestations,
    isLoading: isEasLoading,
    refetch,
  } = usePredictions({
    schemaId: CONVERGE_SCHEMA_UID,
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
      selectedCategory &&
      selectedCategory !== SelectableTab.Selected &&
      selectedCategory !== SelectableTab.MyPredictions
    ) {
      filtered = filtered.filter(
        (comment) => comment.category === selectedCategory
      );
    }

    // Filter by address if 'my-predictions' tab is selected
    // No need to filter by address here, as usePredictions already does it if needed

    // Filter by question prop if set
    if (question) {
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

    // Filter out numeric comments outside the range
    filtered = filtered.filter((comment) => {
      if (comment?.marketClassification === '3') {
        console.log(
          'comment',
          tickToPrice(comment?.lowerBound as number),
          tickToPrice(comment?.upperBound as number),
          comment?.numericValue
        );
      }

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
      // For mock comments, allow them through (they don't have isActive field)
      return comment.isActive !== false;
    });

    return filtered;
  })();

  return (
    <div className={`${className || ''}`}>
      {selectedCategory === SelectableTab.Selected && !question && (
        <div className="text-center text-muted-foreground py-8">
          Please select a question to submit a prediction and view the
          predictions of other users
        </div>
      )}
      {!(selectedCategory === SelectableTab.Selected && !question) && (
        <>
          {isEasLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <LottieLoader width={32} height={32} />
            </div>
          ) : displayComments.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No forecasts found.
            </div>
          ) : (
            <>
              {displayComments.map((comment) => (
                <div
                  key={comment.id}
                  className="relative border-b border-border"
                >
                  <div className="relative bg-background">
                    <div className="px-6 py-5 space-y-5">
                      {/* Comment content */}
                      <div className="border border-border/50 rounded-lg p-4 shadow-sm">
                        <div className="text-xl leading-[1.5] text-foreground/90 tracking-[-0.005em]">
                          {comment.content}
                        </div>
                      </div>
                      {/* Question and Prediction */}
                      <div className="space-y-2">
                        <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] flex items-center gap-2">
                          {comment.marketAddress && comment.marketId ? (
                            <Link
                              href={`/markets/base:${comment.marketAddress.toLowerCase()}/${comment.marketId}`}
                              className="transition-all duration-200 flex items-center gap-1 hover:gap-1.5 hover:text-foreground/80"
                            >
                              {comment.question}
                              <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Link>
                          ) : (
                            comment.question
                          )}
                        </h2>
                        {/* Prediction, time, and signature layout */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Prediction badge/text based on market type */}
                            {comment.prediction &&
                              (() => {
                                return (
                                  <Badge variant="default">
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
                          {/* Address display - right justified */}
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Image
                                alt={comment.address}
                                src={blo(comment.address as `0x${string}`)}
                                className="w-5 h-5 rounded-full ring-1 ring-border/50"
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
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Comments;
