'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import MarketBadge from '~/components/markets/MarketBadge';

interface TickerMarketCardProps {
  condition: {
    id?: string;
    question: string;
    shortName?: string | null;
    endTime?: number | null;
    description?: string | null;
    categorySlug?: string | null;
    resolver?: string | null;
  };
  color: string;
  predictionProbability?: number | null;
}

const TickerMarketCard: React.FC<TickerMarketCardProps> = ({
  condition,
  color,
  predictionProbability = null,
}) => {
  const {
    id,
    question,
    shortName,
    endTime,
    description,
    categorySlug,
    resolver,
  } = condition;
  const { addSelection, removeSelection, selections } =
    useCreatePositionContext();
  const router = useRouter();

  const selectionState = React.useMemo(() => {
    if (!id) return { selectedYes: false, selectedNo: false };
    const existing = selections.find((s) => s.conditionId === id);
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [selections, id]);

  const handleYes = React.useCallback(() => {
    if (!id) return;
    const existing = selections.find((s) => s.conditionId === id);
    if (existing && existing.prediction === true) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId: id,
      question,
      shortName,
      prediction: true,
      categorySlug,
      resolverAddress: resolver,
      endTime,
    });
    router.push('/markets');
  }, [
    id,
    question,
    shortName,
    categorySlug,
    resolver,
    endTime,
    selections,
    removeSelection,
    addSelection,
    router,
  ]);

  const handleNo = React.useCallback(() => {
    if (!id) return;
    const existing = selections.find((s) => s.conditionId === id);
    if (existing && existing.prediction === false) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId: id,
      question,
      shortName,
      prediction: false,
      categorySlug,
      resolverAddress: resolver,
      endTime,
    });
    router.push('/markets');
  }, [
    id,
    question,
    shortName,
    categorySlug,
    resolver,
    endTime,
    selections,
    removeSelection,
    addSelection,
    router,
  ]);

  return (
    <div className="w-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-row items-stretch relative overflow-hidden"
      >
        <div className="w-auto max-w-none md:max-w-[720px]">
          <div className="pl-4 pr-0.5 py-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <MarketBadge
                label={question}
                size={24}
                color={color}
                categorySlug={categorySlug}
              />
              <div className="min-w-0 flex-1 max-w-[320px]">
                <ConditionTitleLink
                  conditionId={id}
                  resolverAddress={resolver ?? undefined}
                  title={question}
                  endTime={endTime}
                  description={description}
                  clampLines={1}
                  className="text-sm min-w-0"
                />
              </div>
              <div className="flex items-center gap-1 text-sm text-foreground/70 shrink-0">
                <MarketPredictionRequest
                  conditionId={id}
                  className="text-sm"
                  eager={predictionProbability == null}
                  suppressLoadingPlaceholder
                  prefetchedProbability={predictionProbability}
                />
              </div>
              <YesNoSplitButton
                onYes={handleYes}
                onNo={handleNo}
                className="ml-auto w-auto shrink-0 md:w-auto [&>button]:w-full md:[&>button]:w-auto [&>button]:h-6 [&>button]:px-2 [&>button]:text-[11px] [&>button]:tracking-wider [&>button]:font-mono [&>button]:rounded-md [&>button]:whitespace-nowrap [&>button]:shadow-none"
                size="sm"
                fullWidth={false}
                selectedYes={selectionState.selectedYes}
                selectedNo={selectionState.selectedNo}
                yesLabel="PREDICT YES"
                noLabel="PREDICT NO"
                labelClassName="font-mono"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TickerMarketCard;
