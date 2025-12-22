'use client';

import { useState, useCallback } from 'react';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';
import { useAccount } from 'wagmi';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { umaResolver } from '@sapience/sdk/contracts';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';
import Comments, { CommentFilters } from '../../components/shared/Comments';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import WalletAddressPopover from '~/components/markets/DataDrawer/WalletAddressPopover';
import SubmitForecastsBlurb from '~/components/shared/SubmitForecastsBlurb';
import ConditionSelect from '~/components/conditions/ConditionSelect';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';
import type { ConditionType } from '~/hooks/graphql/useConditions';
import MarketBadge from '~/components/markets/MarketBadge';

type TabsHeaderProps = {
  isAskTooltipOpen: boolean;
  setIsAskTooltipOpen: (open: boolean) => void;
};

const TabsHeader = ({
  isAskTooltipOpen,
  setIsAskTooltipOpen,
}: TabsHeaderProps) => {
  return (
    <div className="border-b border-border bg-background border-t border-border">
      <div className="flex">
        <button
          type="button"
          className="flex-1 px-4 py-3 font-medium border-b-2 border-b-primary text-primary bg-primary/5"
        >
          Forecast
        </button>
        <TooltipProvider>
          <Tooltip open={isAskTooltipOpen} onOpenChange={setIsAskTooltipOpen}>
            <TooltipTrigger asChild>
              <div className="flex-1">
                <button
                  type="button"
                  disabled
                  className="w-full px-4 py-3 font-medium border-b-2 border-border text-muted-foreground/50 cursor-not-allowed"
                  aria-disabled="true"
                >
                  Ask
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Coming Soon</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

const ForecastPageImp = () => {
  const { address } = useAccount();
  const [selectedCategory, setSelectedCategory] =
    useState<CommentFilters | null>(null);
  const [selectedAddressFilter, setSelectedAddressFilter] = useState<
    string | null
  >(null);
  const [refetchCommentsTrigger, setRefetchCommentsTrigger] = useState(0);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isAskTooltipOpen, setIsAskTooltipOpen] = useState(false);

  // Selected condition (conditions-only UI)
  const [selectedCondition, setSelectedCondition] =
    useState<ConditionType | null>(null);

  const refetchComments = useCallback(() => {
    // Add a small delay to ensure the transaction is processed
    setTimeout(() => {
      setRefetchCommentsTrigger((t) => t + 1);
    }, 1000); // 1 second delay
  }, []);

  const handleConditionSelect = (condition: ConditionType) => {
    setSelectedCategory(CommentFilters.SelectedQuestion);
    setSelectedCondition(condition);
  };

  // Style classes for category buttons
  const selectedStatusClass = 'bg-primary/10 text-primary';
  const hoverStatusClass =
    'hover:bg-muted/50 text-muted-foreground hover:text-foreground';

  return (
    <div className="min-h-screen bg-transparent">
      {/* Main content container with Twitter-like layout */}
      <div
        className={`max-w-2xl mx-auto border-l border-r border-border min-h-screen bg-brand-black backdrop-blur-sm md:rounded-t overflow-hidden`}
      >
        <>
          {/* Tabs */}
          <TabsHeader
            isAskTooltipOpen={isAskTooltipOpen}
            setIsAskTooltipOpen={setIsAskTooltipOpen}
          />

          {/* Lead text */}
          <div className="px-6 pt-6">
            <SubmitForecastsBlurb />
          </div>

          {/* Condition selector */}
          <div className="relative z-50">
            <div className={`p-6 pb-0 ${!selectedCondition ? 'mb-6' : ''}`}>
              <ConditionSelect
                selectedConditionId={selectedCondition?.id || null}
                onSelect={handleConditionSelect}
              />
            </div>
          </div>

          {/* Forecast form for selected condition */}
          {selectedCondition ? (
            <div className="border-b border-border relative pb-3">
              <div className="p-6 pb-4">
                <ConditionForecastForm
                  conditionId={selectedCondition.id}
                  resolver={umaResolver[CHAIN_ID_ARBITRUM]?.address ?? ''}
                  question={
                    selectedCondition.shortName || selectedCondition.question
                  }
                  endTime={selectedCondition.endTime}
                  categorySlug={selectedCondition.category?.slug || null}
                  onSuccess={refetchComments}
                />
              </div>
            </div>
          ) : null}

          {/* Category Selection Section */}
          <div className="bg-background/60 backdrop-blur-sm z-5 relative border-t border-border">
            <div
              className={`flex overflow-x-auto max-w-[100dvw] no-scrollbar ${
                isPopoverOpen ? 'overflow-x-hidden' : ''
              }`}
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
              }}
              onWheel={(e) => {
                // Prevent page scrolling when scrolling horizontally on categories
                e.preventDefault();
                e.stopPropagation();

                // Only handle horizontal scrolling if not in popover
                if (!isPopoverOpen && e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              onTouchMove={(e) => {
                // Prevent page scrolling on touch devices
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {/* All option - moved to first position */}
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                  selectedCategory === null ? 'border-b-primary' : ''
                } ${
                  selectedCategory === null
                    ? selectedStatusClass
                    : hoverStatusClass
                }`}
              >
                <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                  <LayoutGridIcon className="w-2.5 h-2.5 text-zinc-500" />
                </div>
                <span className="font-medium">All</span>
              </button>

              {/* Selected Question option - only show when a condition is selected */}
              {selectedCondition && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCategory(CommentFilters.SelectedQuestion)
                  }
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                    selectedCategory === CommentFilters.SelectedQuestion
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === CommentFilters.SelectedQuestion
                      ? selectedStatusClass
                      : hoverStatusClass
                  }`}
                >
                  <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                    <FileTextIcon className="w-2.5 h-2.5 text-zinc-500" />
                  </div>
                  <span className="font-medium">Selected Question</span>
                </button>
              )}

              {/* My Predictions option with popover */}

              <WalletAddressPopover
                selectedAddress={selectedAddressFilter || ''}
                onWalletSelect={setSelectedAddressFilter}
                isOpen={isPopoverOpen}
                setIsOpen={setIsPopoverOpen}
                side="bottom"
                trigger={
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCategory(CommentFilters.FilterByAccount)
                    }
                    className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                      selectedCategory === CommentFilters.FilterByAccount
                        ? 'border-b-primary'
                        : ''
                    } ${
                      selectedCategory === CommentFilters.FilterByAccount
                        ? selectedStatusClass
                        : hoverStatusClass
                    }`}
                  >
                    <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                      <UserIcon className="w-2.5 h-2.5 text-zinc-500" />
                    </div>
                    <span className="font-medium">Account</span>
                  </button>
                }
              />

              {/* Focus Area Categories */}
              {FOCUS_AREAS.map((focusArea, index) => (
                <button
                  type="button"
                  key={focusArea.id}
                  onClick={() =>
                    setSelectedCategory(focusArea.id as CommentFilters)
                  }
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-b-2 ${
                    index < FOCUS_AREAS.length - 1
                      ? 'border-r border-border'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as CommentFilters)
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as CommentFilters)
                      ? selectedStatusClass
                      : hoverStatusClass
                  }`}
                >
                  <MarketBadge
                    label={focusArea.name}
                    size={16}
                    color={focusArea.color}
                    categorySlug={focusArea.id}
                  />
                  <span className="font-medium">{focusArea.name}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Comments Section */}
          <div className="divide-y divide-border">
            <Comments
              selectedCategory={selectedCategory}
              question={selectedCondition?.question}
              address={selectedAddressFilter || address}
              refetchTrigger={refetchCommentsTrigger}
            />
          </div>
        </>
      </div>
    </div>
  );
};

export default ForecastPageImp;
