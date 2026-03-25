'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { isPredictedYes } from '@sapience/sdk/types';
import { Table, TableBody, TableCell } from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import { RefreshCw } from 'lucide-react';
import PercentChance from '~/components/shared/PercentChance';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import {
  useRecentCombos,
  type RecentCombo,
} from '~/hooks/graphql/useRecentCombos';
import { useComboQuotes } from '~/hooks/auction/useComboQuotes';
import {
  StackedIcons,
  StackedPredictionsTitle,
  type Pick,
} from '~/components/shared/StackedPredictions';

type ExampleCombosProps = {
  className?: string;
};

const NUM_TO_DISPLAY = 3;

function comboToLegs(combo: RecentCombo): Pick[] {
  const legs: Pick[] = [];
  for (const p of combo.picks) {
    if (!p.condition) continue;
    legs.push({
      question: p.condition.question ?? '',
      choice: isPredictedYes(p.predictedOutcome) ? 'Yes' : 'No',
      conditionId: p.conditionId,
      resolverAddress: p.condition.resolver,
      categorySlug: p.condition.category?.slug,
      endTime: p.condition.endTime,
    });
  }
  return legs;
}

const ExampleCombos: React.FC<ExampleCombosProps> = ({ className }) => {
  const chainId = DEFAULT_CHAIN_ID;
  const { combos, isLoading } = useRecentCombos({
    chainId,
    count: NUM_TO_DISPLAY,
  });
  const { quoteProbabilities, requestQuotes } = useComboQuotes(combos, chainId);
  const { addSelection, clearSelections } = useCreatePositionContext();

  const handlePickCombo = React.useCallback(
    (combo: RecentCombo) => {
      clearSelections();
      for (const pick of combo.picks) {
        if (!pick.condition) continue;
        addSelection({
          conditionId: pick.conditionId,
          question: pick.condition.question ?? '',
          shortName: pick.condition.shortName,
          prediction: isPredictedYes(pick.predictedOutcome),
          categorySlug: pick.condition.category?.slug,
          resolverAddress: pick.condition.resolver,
          endTime: pick.condition.endTime,
        });
      }
    },
    [clearSelections, addSelection]
  );

  if (!isLoading && combos.length === 0) return null;

  return (
    <div className={'w-full ' + (className ?? '')}>
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="sc-heading text-foreground">
          Example combo
          <AnimatePresence mode="wait">
            {combos.length !== 1 && (
              <motion.span
                key="plural-s"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                s
              </motion.span>
            )}
          </AnimatePresence>
        </h2>
        <button
          type="button"
          onClick={() => requestQuotes(true)}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Refresh quotes"
        >
          <RefreshCw className="h-4 w-4 text-accent-gold" />
        </button>
      </div>
      <div className="rounded-md border border-brand-white/20 overflow-hidden bg-brand-black">
        <Table className="w-full table-fixed">
          <TableBody>
            {Array.from({
              length: isLoading ? NUM_TO_DISPLAY : combos.length,
            }).map((_, idx) => {
              const combo = combos[idx];
              const isReady = !!combo;
              const legs = combo ? comboToLegs(combo) : [];
              const probability = combo
                ? (quoteProbabilities.get(combo.pickConfigId) ??
                  combo.probability)
                : null;

              return (
                <tr
                  key={combo?.pickConfigId ?? `skeleton-${idx}`}
                  className="border-b border-brand-white/20"
                >
                  {/* Desktop icons cell - hidden on mobile */}
                  <TableCell className="hidden xl:table-cell p-0 w-[88px]">
                    <div className="py-3 pl-4 pr-3 relative h-[48px]">
                      <AnimatePresence mode="wait">
                        {isReady ? (
                          <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 py-3 pl-4 pr-3 flex items-center"
                          >
                            <StackedIcons picks={legs} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="skeleton"
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 py-3 pl-4 pr-3 flex items-center"
                          >
                            <div
                              className="w-10 h-6 rounded bg-brand-white/5"
                              style={{
                                animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                                animationDelay: `${idx * 0.3}s`,
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </TableCell>
                  {/* Question cell - includes all content on mobile */}
                  <TableCell className="py-3 pl-3 xl:pl-0 pr-3 xl:pr-0">
                    <AnimatePresence mode="wait">
                      {isReady && combo ? (
                        <motion.div
                          key="content"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="flex flex-col gap-2 min-w-0"
                        >
                          {/* Mobile Row 1: Icons (on their own line) */}
                          <StackedIcons
                            picks={legs}
                            className="flex xl:hidden"
                          />
                          {/* Row 2: Question + Badge + "and N others" */}
                          <StackedPredictionsTitle
                            picks={legs}
                            className="xl:gap-x-2"
                            maxWidthClass="max-w-full xl:max-w-[460px]"
                          />
                          {/* Mobile Row 3/4: Probability + PICK in one row */}
                          <div className="xl:hidden mt-0.5 flex items-center gap-3">
                            <div className="text-sm flex-1 min-w-0 max-w-[240px]">
                              {probability !== null ? (
                                <>
                                  <PercentChance
                                    probability={1 - probability}
                                    showLabel
                                    label="chance"
                                    className="font-mono text-ethena"
                                  />
                                  <span className="text-muted-foreground ml-1">
                                    implied by 1 USDe
                                  </span>
                                  <br />
                                  <span className="text-muted-foreground">
                                    payout
                                  </span>
                                  <span className="text-brand-white font-medium font-mono ml-1">
                                    {(1 / (1 - probability)).toLocaleString(
                                      undefined,
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }
                                    )}{' '}
                                    USDe
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                            <Button
                              className="tracking-wider font-mono text-xs px-3 h-8 bg-brand-white text-brand-black ml-auto"
                              variant="default"
                              size="sm"
                              type="button"
                              onClick={() => handlePickCombo(combo)}
                            >
                              PICK
                            </Button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="skeleton"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="flex flex-col gap-2"
                        >
                          {/* Mobile Row 1: Icons skeleton */}
                          <div
                            className="xl:hidden w-10 h-6 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3}s`,
                            }}
                          />
                          {/* Row 2: Question skeleton */}
                          <div
                            className="w-full max-w-[300px] h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.1}s`,
                            }}
                          />
                          {/* Mobile Row 3: Probability skeleton */}
                          <div
                            className="xl:hidden w-full max-w-[240px] h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.2}s`,
                            }}
                          />
                          {/* Mobile Row 4: Button skeleton */}
                          <div
                            className="xl:hidden w-full h-8 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.15}s`,
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </TableCell>
                  {/* Probability cell - desktop only */}
                  <TableCell className="hidden xl:table-cell py-3 pl-4 text-right whitespace-nowrap">
                    <AnimatePresence mode="wait">
                      {isReady ? (
                        <motion.div
                          key="content"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          {probability !== null ? (
                            <div className="text-sm">
                              <PercentChance
                                probability={1 - probability}
                                showLabel
                                label="chance"
                                className="font-mono text-ethena"
                              />
                              <span className="text-muted-foreground ml-1">
                                implied by 1 USDe for payout
                              </span>
                              <span className="text-brand-white font-medium font-mono ml-1">
                                {(1 / (1 - probability)).toLocaleString(
                                  undefined,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}{' '}
                                USDe
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="skeleton"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div
                            className="w-full h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.2}s`,
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </TableCell>
                  {/* Desktop PICK button cell - hidden on mobile */}
                  <TableCell className="hidden xl:table-cell p-0 w-[72px]">
                    <div className="py-3 pr-4 flex justify-end">
                      <AnimatePresence mode="wait">
                        {isReady && combo ? (
                          <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Button
                              className="tracking-wider font-mono text-xs px-3 h-7 bg-brand-white text-brand-black"
                              variant="default"
                              size="sm"
                              type="button"
                              onClick={() => handlePickCombo(combo)}
                            >
                              PICK
                            </Button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="skeleton"
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div
                              className="w-14 h-7 rounded bg-brand-white/5"
                              style={{
                                animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                                animationDelay: `${idx * 0.3 + 0.15}s`,
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ExampleCombos;
