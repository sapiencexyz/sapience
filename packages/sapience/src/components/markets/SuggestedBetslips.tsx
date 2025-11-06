'use client';

import * as React from 'react';
import { SquareStackIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import RefreshIconButton from '~/components/shared/RefreshIconButton';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

type SuggestedBetslipsProps = {
  onRefresh?: () => void;
  className?: string;
};

const SuggestedBetslips: React.FC<SuggestedBetslipsProps> = ({
  onRefresh,
  className,
}) => {
  const [nonce, setNonce] = React.useState(0);
  const { data: allConditions = [], isLoading } = useConditions({
    take: 200,
    chainId: useChainIdFromLocalStorage(),
  });
  const { addParlaySelection } = useBetSlipContext();

  const handleRefresh = React.useCallback(() => {
    setNonce((n) => n + 1);
    onRefresh?.();
  }, [onRefresh]);

  const getCategoryColor = React.useCallback((slug?: string | null) => {
    return getCategoryStyle(slug).color;
  }, []);

  const combos = React.useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const publicConditions = (allConditions || []).filter((c) => {
      if (!c.public) return false;
      const end = typeof c.endTime === 'number' ? c.endTime : 0;
      return end > nowSec; // only include future-ending conditions
    });
    if (publicConditions.length === 0)
      return [] as Array<
        Array<{ condition: ConditionType; prediction: boolean }>
      >;

    const byCategory = publicConditions.reduce<Record<string, ConditionType[]>>(
      (acc, c) => {
        const slug = c.category?.slug || 'uncategorized';
        if (!acc[slug]) acc[slug] = [];
        acc[slug].push(c);
        return acc;
      },
      {}
    );

    const categorySlugs = Object.keys(byCategory);
    function pickRandom<T>(arr: T[]): T {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    const makeOneCombo = (): Array<{
      condition: ConditionType;
      prediction: boolean;
    }> => {
      const result: Array<{ condition: ConditionType; prediction: boolean }> =
        [];

      // Prefer three distinct categories if available
      const shuffledCats = [...categorySlugs].sort(() => Math.random() - 0.5);
      for (const cat of shuffledCats) {
        if (result.length >= 3) break;
        const pool = byCategory[cat];
        if (!pool || pool.length === 0) continue;
        result.push({
          condition: pickRandom(pool),
          prediction: Math.random() < 0.5,
        });
      }

      // Fallback: fill remaining legs from any remaining conditions (avoid duplicates)
      if (result.length < 3) {
        const usedIds = new Set(result.map((r) => r.condition.id));
        const remaining = publicConditions.filter((c) => !usedIds.has(c.id));
        while (result.length < 3 && remaining.length > 0) {
          const idx = Math.floor(Math.random() * remaining.length);
          const [picked] = remaining.splice(idx, 1);
          result.push({ condition: picked, prediction: Math.random() < 0.5 });
        }
      }

      return result.slice(0, 3);
    };

    // Always prepare three combos; UI will hide extras on smaller screens
    const comboCount = 3;
    return Array.from({ length: comboCount }, () => makeOneCombo());
  }, [allConditions, nonce]);

  return (
    <div className={'w-full font-mono ' + (className ?? '')}>
      <div className="p-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="eyebrow text-foreground font-sans">
            Featured Parlays
          </h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <RefreshIconButton
                  onClick={handleRefresh}
                  ariaLabel="Randomize featured parlays"
                  title="Randomize featured parlays"
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                  iconClassName="w-3 h-3"
                />
              </TooltipTrigger>
              <TooltipContent>Randomize featured parlays</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="mt-0 mb-0 pb-0 grid grid-cols-1 lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4 xl:gap-4">
        {isLoading || combos.length === 0 ? (
          <>
            <div className="bg-brand-black text-brand-white/70 rounded-b-none border border-brand-white/10 overflow-hidden shadow-sm h-20 flex items-center justify-center">
              Loading…
            </div>
            <div className="bg-brand-black text-brand-white/70 rounded-b-none border border-brand-white/10 overflow-hidden shadow-sm h-20 hidden lg:flex items-center justify-center">
              Loading…
            </div>
            <div className="bg-brand-black text-brand-white/70 rounded-b-none border border-brand-white/10 overflow-hidden shadow-sm h-20 hidden lg:flex items-center justify-center">
              Loading…
            </div>
          </>
        ) : (
          combos.map((combo, idx) => {
            const colors = combo.map((leg) =>
              getCategoryColor(leg.condition.category?.slug)
            );
            let stops: string[];
            if (colors.length <= 1) {
              stops = [colors[0] || 'transparent'];
            } else {
              const step = 100 / (colors.length - 1);
              stops = colors.map((color, i) => `${color} ${i * step}%`);
            }
            const gradient = `linear-gradient(to right, ${stops.join(', ')})`;

            return (
              <div
                key={`combo-${idx}`}
                className={`relative bg-brand-black text-brand-white/90 rounded-b-none border border-brand-white/10 overflow-hidden shadow-sm p-0 ${idx > 0 ? 'hidden lg:block' : ''}`}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: gradient }}
                />
                <div className="space-y-0 flex flex-col">
                  {combo.map((leg, i) => (
                    <div
                      key={leg.condition.id + '-' + i}
                      className="border-b border-border/70 last:border-b-0 flex-1"
                    >
                      <div className="flex items-stretch">
                        <div
                          className={`flex-1 min-w-0 px-3 ${i === 0 ? 'pt-3 pb-2.5' : 'py-2.5'} flex items-center justify-between gap-3`}
                        >
                          <h3 className="text-sm leading-snug min-w-0 max-w-full">
                            <ConditionTitleLink
                              conditionId={leg.condition.id}
                              title={
                                leg.condition.shortName ||
                                leg.condition.question
                              }
                              endTime={leg.condition.endTime}
                              description={leg.condition.description}
                              clampLines={1}
                            />
                          </h3>
                          <span className="relative -top-0.5 ml-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={`${leg.prediction ? 'px-2 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0' : 'px-2 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0'}`}
                            >
                              {leg.prediction ? 'Yes' : 'No'}
                            </Badge>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-stretch">
                    <div className="flex-1 pl-3 pr-2 py-3">
                      <div className="text-sm text-foreground/70 w-full mb-3">
                        <div className="truncate whitespace-nowrap min-w-0 h-5 flex items-center gap-1">
                          <span>Current Forecast:</span>
                          <MarketPredictionRequest
                            key={`mpr-${nonce}-${combo
                              .map(
                                (leg) =>
                                  `${leg.condition.id}:${leg.prediction ? '1' : '0'}`
                              )
                              .join('|')}`}
                            outcomes={combo.map((leg) => ({
                              marketId: leg.condition.id,
                              prediction: leg.prediction,
                            }))}
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full gap-2 tracking-wider"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          combo.forEach((leg) => {
                            addParlaySelection({
                              conditionId: leg.condition.id,
                              question:
                                leg.condition.shortName ||
                                leg.condition.question,
                              prediction: leg.prediction,
                            });
                          });
                        }}
                      >
                        <SquareStackIcon className="h-4 w-4" />
                        PICK PARLAY
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SuggestedBetslips;
