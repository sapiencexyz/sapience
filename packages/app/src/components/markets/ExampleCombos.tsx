'use client';

import * as React from 'react';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import {
  DEFAULT_CHAIN_ID,
  PREFERRED_ESTIMATE_QUOTER,
} from '@sapience/sdk/constants';
import { OutcomeSide } from '@sapience/sdk/types';
import PercentChance from '~/components/shared/PercentChance';
import { Table, TableBody, TableCell } from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import { RefreshCw } from 'lucide-react';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import hub from '~/lib/auction/useAuctionBidsHub';
import {
  StackedIcons,
  StackedPredictionsTitle,
  type Pick,
} from '~/components/shared/StackedPredictions';

type ExampleCombosProps = {
  className?: string;
};

type ComboPick = { condition: ConditionType; prediction: boolean };

type ComboWithQuote = {
  combo: ComboPick[];
  auctionId: string | null;
  probability: number | null;
  status: 'pending' | 'requesting' | 'received' | 'error';
};

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;
const PREDICTOR_POSITION_SIZE_WEI = parseUnits('1', 18).toString();
const NUM_QUOTES_TO_REQUEST = 9;
const NUM_TO_DISPLAY = 3;
const DISPLAY_TIMEOUT_MS = 4000;

const ExampleCombos: React.FC<ExampleCombosProps> = ({ className }) => {
  const chainId = DEFAULT_CHAIN_ID;

  const { data: allConditions = [], isLoading } = useConditions({
    take: 100,
    chainId,
  });
  const { addSelection, clearSelections } = useCreatePositionContext();
  const { apiBaseUrl } = useSettings();
  const { address: walletAddress } = useAccount();

  const PREDICTION_MARKET_ADDRESS =
    predictionMarketEscrow[chainId]?.address ||
    predictionMarketEscrow[DEFAULT_CHAIN_ID]?.address;

  const selectedPredictorAddress = walletAddress || ZERO_ADDRESS;

  const { data: predictorNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketEscrowAbi,
    functionName: 'getNonce',
    args: selectedPredictorAddress ? [selectedPredictorAddress] : undefined,
    chainId: chainId,
    query: {
      enabled: !!selectedPredictorAddress && !!PREDICTION_MARKET_ADDRESS,
    },
  });

  const wsUrl = React.useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  // State for tracking quotes
  const [comboQuotes, setComboQuotes] = React.useState<ComboWithQuote[]>([]);
  const [hubTick, setHubTick] = React.useState(0);

  // State for locking displayed combos (lock which combos, but allow price updates)
  const [isLocked, setIsLocked] = React.useState(false);
  const [lockedIndices, setLockedIndices] = React.useState<number[]>([]);
  const [timeoutPassed, setTimeoutPassed] = React.useState(false);

  // Subscribe to hub updates
  React.useEffect(() => {
    if (wsUrl) hub.setUrl(wsUrl);
    const off = hub.addListener(() => setHubTick((t) => (t + 1) % 1_000_000));
    return () => off();
  }, [wsUrl]);

  // Start timeout timer when quotes are requested
  React.useEffect(() => {
    if (comboQuotes.length > 0 && !isLocked) {
      const timer = setTimeout(
        () => setTimeoutPassed(true),
        DISPLAY_TIMEOUT_MS
      );
      return () => clearTimeout(timer);
    }
  }, [comboQuotes.length, isLocked]);

  // Convert ComboPick[] to Pick[] for the shared component
  const comboToLegs = React.useCallback(
    (combo: ComboPick[]): Pick[] =>
      combo.map((leg) => ({
        question: leg.condition.question,
        choice: leg.prediction ? ('Yes' as const) : ('No' as const),
        conditionId: leg.condition.id,
        resolverAddress: leg.condition.resolver,
        categorySlug: leg.condition.category?.slug,
        endTime: leg.condition.endTime,
        description: leg.condition.description,
      })),
    []
  );

  // Generate 9 random combos
  const generateCombos = React.useCallback(
    (conditions: ConditionType[]): ComboPick[][] => {
      const nowSec = Math.floor(Date.now() / 1000);
      const publicConditions = conditions.filter((c) => {
        if (!c.public) return false;
        const end = typeof c.endTime === 'number' ? c.endTime : 0;
        if (end <= nowSec) return false;
        return true;
      });
      if (publicConditions.length === 0) return [];

      const byCategory = publicConditions.reduce<
        Record<string, ConditionType[]>
      >((acc, c) => {
        const slug = c.category?.slug || 'uncategorized';
        if (!acc[slug]) acc[slug] = [];
        acc[slug].push(c);
        return acc;
      }, {});

      const categorySlugs = Object.keys(byCategory);
      function pickRandom<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      const makeOneCombo = (): ComboPick[] => {
        const result: ComboPick[] = [];
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

      return Array.from({ length: NUM_QUOTES_TO_REQUEST }, () =>
        makeOneCombo()
      );
    },
    []
  );

  // Request quotes for all combos
  const requestAllQuotes = React.useCallback(() => {
    if (!wsUrl || allConditions.length === 0) return;

    const combos = generateCombos(allConditions);
    if (combos.length === 0) return;

    const client = getSharedAuctionWsClient(wsUrl);
    const newQuotes: ComboWithQuote[] = combos.map((combo) => ({
      combo,
      auctionId: null,
      probability: null,
      status: 'pending' as const,
    }));

    setComboQuotes(newQuotes);

    // Reset lock state so new combos can be displayed
    setIsLocked(false);
    setLockedIndices([]);
    setTimeoutPassed(false);

    // Request quotes with jittered timing
    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const jitter = Math.floor(Math.random() * 200) + i * 100;

      setTimeout(async () => {
        try {
          // Build escrow picks payload
          const rawPicks = combo.map((leg) => ({
            conditionResolver: leg.condition.resolver as `0x${string}`,
            conditionId: (leg.condition.id.startsWith('0x')
              ? leg.condition.id
              : `0x${leg.condition.id}`) as `0x${string}`,
            predictedOutcome: leg.prediction ? OutcomeSide.YES : OutcomeSide.NO,
          }));
          const picks = canonicalizePicks(rawPicks);
          const nowSec = Math.floor(Date.now() / 1000);

          const requestPayload = {
            picks: picks.map((p) => ({
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome,
            })),
            predictorCollateral: PREDICTOR_POSITION_SIZE_WEI,
            predictor: selectedPredictorAddress,
            predictorNonce:
              predictorNonce !== undefined ? Number(predictorNonce) : 0,
            predictorDeadline: nowSec + 300,
            chainId: chainId,
          };

          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: 'requesting' as const } : q
            )
          );

          const response = await client.sendWithAck<{ auctionId?: string }>(
            'auction.start',
            requestPayload,
            { timeoutMs: 15000 }
          );

          const auctionId = response?.auctionId || null;
          if (auctionId) {
            hub.ensureSubscribed(auctionId);
          }

          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? {
                    ...q,
                    auctionId,
                    status: auctionId ? 'requesting' : 'error',
                  }
                : q
            )
          );
        } catch {
          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: 'error' as const } : q
            )
          );
        }
      }, jitter);
    }
  }, [
    wsUrl,
    allConditions,
    generateCombos,
    chainId,
    selectedPredictorAddress,
    predictorNonce,
  ]);

  // Trigger quote requests when conditions first load.
  // Deliberately omit requestAllQuotes from deps: we only want this to fire
  // once when data arrives, not re-fire when predictorNonce/wsUrl change (which
  // would reset comboQuotes and the timeout timer, causing permanent skeletons).
  React.useEffect(() => {
    if (!isLoading && allConditions.length > 0) {
      requestAllQuotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, allConditions.length]);

  // Update probabilities from hub bids
  React.useEffect(() => {
    setComboQuotes((prev) =>
      prev.map((q) => {
        if (!q.auctionId) return q;
        const allBids = hub.bidsByAuctionId.get(q.auctionId);
        if (!allBids || allBids.length === 0) return q;

        // For anonymous users, only accept bids from the trusted quoter
        const isAnonymousUser = selectedPredictorAddress === ZERO_ADDRESS;
        const bids = isAnonymousUser
          ? allBids.filter(
              (b) =>
                b.counterparty?.toLowerCase() ===
                PREFERRED_ESTIMATE_QUOTER.toLowerCase()
            )
          : allBids;
        if (bids.length === 0) return q;

        const nowMs = Date.now();
        const valid = bids.filter((b) => {
          const dl = Number(b?.counterpartyDeadline || 0);
          return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
        });
        const list = valid.length > 0 ? valid : bids;
        const best = list.reduce((acc, cur) => {
          return BigInt(cur.counterpartyCollateral) >
            BigInt(acc.counterpartyCollateral)
            ? cur
            : acc;
        }, list[0]);

        const predictorWei = BigInt(PREDICTOR_POSITION_SIZE_WEI);
        const counterpartyWei = BigInt(
          String(best?.counterpartyCollateral || '0')
        );
        const denom = counterpartyWei + predictorWei;
        const prob = denom > 0n ? Number(counterpartyWei) / Number(denom) : 0.5;
        const safeProbability = Math.max(0, Math.min(1, prob));

        return {
          ...q,
          probability: safeProbability,
          status: 'received' as const,
        };
      })
    );
  }, [hubTick, selectedPredictorAddress]);

  // Lock combos when all received OR (timeout passed AND at least 1 received)
  React.useEffect(() => {
    if (isLocked) return; // Already locked, don't update

    const quotesWithProb = comboQuotes
      .map((q, idx) => ({ ...q, originalIndex: idx }))
      .filter((q) => q.probability !== null && q.status === 'received');
    const allReceived = quotesWithProb.length >= NUM_QUOTES_TO_REQUEST;
    const hasAtLeastOne = quotesWithProb.length >= 1;

    // Lock when: all 9 received OR (timeout passed AND at least 1 received)
    if (allReceived || (timeoutPassed && hasAtLeastOne)) {
      // Sort by highest probability (highest payout) and lock the indices
      const sorted = [...quotesWithProb].sort(
        (a, b) => (b.probability ?? 0) - (a.probability ?? 0)
      );
      setLockedIndices(
        sorted.slice(0, NUM_TO_DISPLAY).map((q) => q.originalIndex)
      );
      setIsLocked(true);
    }
  }, [comboQuotes, timeoutPassed, isLocked]);

  // Get top 3 - use locked indices to look up current values (allows price updates)
  const topCombos = React.useMemo(() => {
    if (isLocked) {
      // Map locked indices back to current comboQuotes for live price updates
      return lockedIndices.map((idx) => comboQuotes[idx]).filter(Boolean);
    }
    // Return empty array while waiting (keeps skeleton visible)
    return [];
  }, [isLocked, lockedIndices, comboQuotes]);

  const handlePickCombo = React.useCallback(
    (combo: ComboPick[]) => {
      clearSelections();
      combo.forEach((leg) => {
        addSelection({
          conditionId: leg.condition.id,
          question: leg.condition.question,
          shortName: leg.condition.shortName,
          prediction: leg.prediction,
          categorySlug: leg.condition.category?.slug,
          resolverAddress: leg.condition.resolver,
          endTime: leg.condition.endTime,
        });
      });
    },
    [clearSelections, addSelection]
  );

  return (
    <div className={'w-full ' + (className ?? '')}>
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="sc-heading text-foreground">
          Example combo
          <AnimatePresence mode="wait">
            {!(isLocked && lockedIndices.length === 1) && (
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
          onClick={requestAllQuotes}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Refresh combinations"
        >
          <RefreshCw className="h-4 w-4 text-accent-gold" />
        </button>
      </div>
      <div className="rounded-md border border-brand-white/20 overflow-hidden bg-brand-black">
        <Table className="w-full table-fixed">
          <TableBody>
            {Array.from({
              length: isLocked ? topCombos.length : NUM_TO_DISPLAY,
            }).map((_, idx) => {
              const item = topCombos[idx];
              const isReady = !!item;
              const combo = item?.combo;
              const probability = item?.probability;
              const status = item?.status;
              const legs = combo ? comboToLegs(combo) : [];

              return (
                <tr
                  key={`row-${idx}`}
                  className="border-b border-brand-white/20"
                >
                  {/* Desktop icons cell - hidden on mobile */}
                  <TableCell className="hidden md:table-cell p-0 w-[88px]">
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
                  <TableCell className="py-3 pl-3 md:pl-0 pr-3 md:pr-0">
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
                            className="flex md:hidden"
                          />
                          {/* Row 2: Question + Badge + "and N others" */}
                          <StackedPredictionsTitle
                            picks={legs}
                            className="md:gap-x-2"
                            maxWidthClass="max-w-full md:max-w-[460px]"
                          />
                          {/* Mobile Row 3/4: Probability + PICK in one row */}
                          <div className="md:hidden mt-0.5 flex items-center gap-3">
                            <div className="text-sm flex-1 min-w-0 max-w-[240px]">
                              {status === 'received' && probability !== null ? (
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
                                    {(1 / (1 - probability)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDe
                                  </span>
                                </>
                              ) : status === 'error' ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="text-foreground/70">
                                  Initializing auction...
                                </span>
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
                            className="md:hidden w-10 h-6 rounded bg-brand-white/5"
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
                            className="md:hidden w-full max-w-[240px] h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.2}s`,
                            }}
                          />
                          {/* Mobile Row 4: Button skeleton */}
                          <div
                            className="md:hidden w-full h-8 rounded bg-brand-white/5"
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
                  <TableCell className="hidden md:table-cell py-3 pl-4 text-right whitespace-nowrap">
                    <AnimatePresence mode="wait">
                      {isReady ? (
                        <motion.div
                          key="content"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          {status === 'received' && probability !== null ? (
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
                                {(1 / (1 - probability)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDe
                              </span>
                            </div>
                          ) : status === 'error' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-foreground/70">
                              Initializing auction...
                            </span>
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
                  <TableCell className="hidden md:table-cell p-0 w-[72px]">
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
