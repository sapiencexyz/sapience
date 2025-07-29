'use client';

import { blo } from 'blo';
import Image from 'next/image';
import { useEffect } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { Filter } from 'lucide-react';
import { AddressDisplay, useEnsName } from './AddressDisplay';
import { usePredictions } from '~/hooks/graphql/usePredictions';
import { CONVERGE_SCHEMA_UID } from '~/lib/constants/eas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';

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
  question: string; // Added question field
  category?: string; // Added category field
  answer: Answer;
  marketClassification?: string; // Added marketClassification field
  optionIndex?: number;
  totalOptions?: number;
  numericValue?: number;
  lowerBound?: number;
  upperBound?: number;
  isActive?: boolean; // Added isActive field
}

interface CommentsProps {
  className?: string;
  question?: string;
  showAllForecasts?: boolean;
  selectedCategory?: SelectableTab | null;
  address?: string | null;
  refetchTrigger?: number;
  selectedAddressFilter?: string | null;
  onAddressFilterChange?: (address: string | null) => void;
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

// Component to handle ENS resolution for filter button
const FilterButton = ({
  address,
  onFilter,
}: {
  address: string;
  onFilter: (resolvedAddress: string) => void;
}) => {
  const { data: ensName } = useEnsName(address);
  const displayName = ensName || address;

  const handleFilterClick = async () => {
    // If the address is an ENS name, resolve it first
    if (displayName.includes('.eth')) {
      try {
        // Import the mainnetClient dynamically to avoid circular dependencies
        const { mainnetClient } = await import('~/lib/utils/util');
        const resolvedAddress = await mainnetClient.getEnsAddress({
          name: displayName,
        });
        if (resolvedAddress) {
          onFilter(resolvedAddress);
        } else {
          // If resolution fails, use the original address
          onFilter(address);
        }
      } catch (error) {
        console.error('Failed to resolve ENS:', error);
        // If resolution fails, use the original address
        onFilter(address);
      }
    } else {
      // If it's already an address, use it directly
      onFilter(address);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 w-5 p-0 ml-1"
      onClick={handleFilterClick}
      title={`Filter by ${displayName}`}
    >
      <Filter className="h-3 w-3 text-muted-foreground hover:text-foreground" />
    </Button>
  );
};

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
  let optionName: string | undefined = undefined;
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
      if (market && market.optionName) {
        optionName = market.optionName;
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
  const YES_SQRT_PRICE_X96 = BigInt('79228162514264337593543950336');
  if (marketClassification === '2') {
    // YES_NO
    predictionText = `${prediction === YES_SQRT_PRICE_X96 ? 'Yes' : 'No'}`;
  } else if (marketClassification === '1') {
    // MULTIPLE_CHOICE
    predictionText = optionName ? `${optionName}` : `Option ID: ${marketId}`;
  } else if (marketClassification === '3') {
    // NUMERIC
    predictionText = `${numericValue?.toString()}${baseTokenName ? ' ' + baseTokenName : ''}${quoteTokenName ? '/' + quoteTokenName : ''}`;
  } else {
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
  };
}

const Comments = ({
  className,
  question = undefined,
  selectedCategory = null,
  address = null,
  refetchTrigger,
  selectedAddressFilter = null,
  onAddressFilterChange,
}: CommentsProps) => {
  // Fetch EAS attestations
  const shouldFilterByAttester =
    selectedCategory === SelectableTab.MyPredictions &&
    address &&
    typeof address === 'string' &&
    address.length > 0;
  const {
    data: easAttestations,
    isLoading: _isEasLoading,
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

    // Filter by selected address filter
    if (selectedAddressFilter) {
      filtered = filtered.filter((comment) => {
        // Since we now resolve ENS to addresses, we can do exact matching
        const matches =
          comment.address.toLowerCase() === selectedAddressFilter.toLowerCase();
        return matches;
      });
    }

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
          {/* Show active filter indicator */}
          {selectedAddressFilter && (
            <div className="px-6 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Filtering by address:</span>
                <span className="font-mono bg-background px-2 py-1 rounded">
                  {selectedAddressFilter}
                </span>
                <button
                  onClick={() => onAddressFilterChange?.(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {displayComments.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No forecasts found.
            </div>
          )}
          {displayComments.map((comment, index) => (
            <div key={comment.id} className="relative">
              {/* Divider */}
              {index > 0 && <div className="border-t border-border" />}
              <div className="relative bg-background">
                <div className="px-6 py-5 space-y-4">
                  {/* Question and Prediction */}
                  <div className="space-y-2">
                    <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                      {comment.question}
                    </h2>
                    {/* Prediction and Signature on same line */}
                    <div className="flex items-center gap-4">
                      {/* Prediction badge/text based on market type */}
                      {comment.prediction &&
                        (() => {
                          return (
                            <span
                              className={`inline-flex items-center h-6 px-2.5 text-xs font-semibold rounded-full border`}
                            >
                              {comment.prediction}
                            </span>
                          );
                        })()}
                      {/* Signature */}
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
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-medium">
                          <AddressDisplay
                            address={comment.address}
                            disableProfileLink={false}
                            className="text-xs"
                          />
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground/70">
                            {new Date(comment.timestamp).toLocaleString(
                              undefined,
                              {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )}
                          </span>
                          {/* Filter button for this address */}
                          <FilterButton
                            address={comment.address}
                            onFilter={(displayName) =>
                              onAddressFilterChange?.(displayName)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Comment content */}
                  <div className="text-base leading-[1.5] text-foreground/90 tracking-[-0.005em]">
                    {comment.content}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default Comments;
