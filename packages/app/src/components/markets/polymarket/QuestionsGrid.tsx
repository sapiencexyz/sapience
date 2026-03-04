'use client';

import * as React from 'react';
import { ConditionCard, GroupCard, staggerContainer } from './MarketCard';
import {
  type TopLevelRow,
  type QuestionType,
  buildTopLevelRows,
  groupConditionToConditionType,
} from '../market-helpers';
// @ts-expect-error — @types/react-dom is not installed; react-dom@19 ships JS-only in this project
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { usePredictionMap } from '~/hooks/usePredictionMap';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuestionsGridProps {
  questions: QuestionType[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onFetchMore?: () => void;
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/10 p-5 animate-pulse flex flex-col">
      {/* Category label */}
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded bg-white/15" />
        <div className="h-3 w-24 rounded bg-white/15" />
      </div>

      {/* Title + gauge */}
      <div className="mt-2 flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="h-4 w-full rounded bg-white/15" />
          <div className="h-4 w-2/3 rounded bg-white/15" />
        </div>
        <div className="h-8 w-14 rounded-full bg-white/15 shrink-0" />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* YES / NO buttons */}
      <div className="mt-3 flex gap-3">
        <div className="h-9 flex-1 rounded-xl bg-white/15" />
        <div className="h-9 flex-1 rounded-xl bg-white/15" />
      </div>

      {/* OI + end time footer */}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="h-3 w-32 rounded bg-white/15" />
        <div className="h-3 w-20 rounded bg-white/15" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuestionsGrid({
  questions,
  isLoading,
  isFetchingMore,
  hasMore,
  onFetchMore,
}: QuestionsGridProps) {
  const { predictionMapRef, handlePrediction } = usePredictionMap();

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const { loadMoreRef } = useInfiniteScroll({
    hasMore,
    isFetchingMore,
    isLoading,
    onFetchMore,
    scrollContainerRef,
  });

  const [openGroupId, setOpenGroupId] = React.useState<number | null>(null);

  const handleToggleExpand = React.useCallback((groupId: number) => {
    setOpenGroupId((prev) => (prev === groupId ? null : groupId));
  }, []);

  const rows = React.useMemo(() => buildTopLevelRows(questions), [questions]);

  const openGroupRow = React.useMemo(
    () =>
      openGroupId != null
        ? (rows.find(
            (r): r is TopLevelRow & { kind: 'group' } =>
              r.kind === 'group' && r.groupId === openGroupId
          ) ?? null)
        : null,
    [rows, openGroupId]
  );

  const showLoading = !!isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 pb-6 md:px-6 md:pb-8"
      >
        <AnimatePresence mode="wait">
          {showLoading ? (
            <motion.div
              key="skeleton"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </motion.div>
          ) : rows.length === 0 ? (
            <motion.div
              key="empty"
              className="flex items-center justify-center py-20 text-white/60 font-display text-[15px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              No results found.
            </motion.div>
          ) : (
            <motion.div key="cards">
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {rows.map((row) => {
                  if (row.kind === 'group') {
                    return (
                      <GroupCard
                        key={row.id}
                        row={row}
                        onToggleExpand={handleToggleExpand}
                      />
                    );
                  }

                  return (
                    <ConditionCard
                      key={row.id}
                      row={row}
                      predictionMapRef={predictionMapRef}
                      onPrediction={handlePrediction}
                    />
                  );
                })}

                {isFetchingMore && hasMore && (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <SkeletonCard key={`loading-${i}`} />
                    ))}
                  </>
                )}
              </motion.div>

              {/* Overlay for group options */}
              {typeof document !== 'undefined' &&
                createPortal(
                  <AnimatePresence>
                    {openGroupRow && (
                      <motion.div
                        key="group-overlay"
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                      >
                        {/* Backdrop */}
                        <div
                          className="absolute inset-0 bg-black/20"
                          onClick={() => setOpenGroupId(null)}
                        />
                        {/* Panel */}
                        <motion.div
                          className="markets-grid-theme relative rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-6 w-full max-w-5xl max-h-[80vh] overflow-y-auto"
                          style={{
                            background:
                              'linear-gradient(165deg, #1354F0 0%, #082B89 100%)',
                          }}
                          initial={{ scale: 0.97, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.97, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <p className="font-display text-lg font-semibold text-white">
                              {openGroupRow.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => setOpenGroupId(null)}
                              className="rounded-full p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <motion.div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                            variants={staggerContainer}
                            initial="hidden"
                            animate="visible"
                          >
                            {openGroupRow.conditions.map((gc) => {
                              const conditionType =
                                groupConditionToConditionType(gc);
                              const childRow: TopLevelRow = {
                                kind: 'condition' as const,
                                id: `condition-${gc.id}`,
                                condition: conditionType,
                              };
                              return (
                                <ConditionCard
                                  key={`child-${gc.id}`}
                                  row={
                                    childRow as TopLevelRow & {
                                      kind: 'condition';
                                    }
                                  }
                                  predictionMapRef={predictionMapRef}
                                  onPrediction={handlePrediction}
                                  variant="child"
                                />
                              );
                            })}
                          </motion.div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={loadMoreRef} className="h-1" />
      </div>
    </div>
  );
}
