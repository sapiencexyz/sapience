'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import Image from 'next/image';
import { PythOracleMark } from '@sapience/ui';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import {
  Activity,
  ArrowLeftRight,
  Bot,
  FileText,
  DollarSign,
  Handshake,
  Telescope,
} from 'lucide-react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { OutcomeSide } from '@sapience/sdk/types';
import { formatEther } from 'viem';
import { decodePythMarketId } from '@sapience/sdk';
import { decodePythLazerFeedId } from '@sapience/sdk/auction/encoding';
import { PYTH_FEEDS } from '@sapience/sdk/constants';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import { ResolverBadge } from '~/components/shared/ResolverBadge';
import Comments, { CommentFilters } from '~/components/shared/Comments';
import PredictionForm from '~/components/markets/pages/PredictionForm';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';
import { POLYMARKET_RESOLVER_ADDRESSES } from '~/lib/constants';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { FocusAreaBadge } from '~/components/shared/FocusAreaBadge';
import ResearchAgent from '~/components/markets/ResearchAgent';
import ActivityTable from '~/components/positions/ActivityTable';
import PositionsTable from '~/components/positions/PositionsTable';
import { usePredictionsByConditionId } from '~/hooks/graphql/usePositions';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { d18ToPercentage } from '~/lib/utils/util';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { getQuestionHref } from '~/lib/utils/questionHref';
import {
  type PredictionData,
  type ForecastData,
  type CombinedPrediction,
  PredictionScatterChart,
  TechSpecTable,
  scatterChartStyles,
} from '~/components/markets/question';

const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

interface QuestionPageContentProps {
  conditionId: string;
  resolverAddressFromUrl?: string;
}

export default function QuestionPageContent({
  conditionId,
  resolverAddressFromUrl,
}: QuestionPageContentProps) {
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);
  const router = useRouter();

  // Fetch condition data - filter by both conditionId and resolver address when available
  const { data, isLoading, isError } = useQuery<
    {
      id: string;
      question: string;
      shortName?: string | null;
      endTime?: number | null;
      settled?: boolean | null;
      resolvedToYes?: boolean | null;
      nonDecisive?: boolean | null;
      description?: string | null;
      category?: { slug: string } | null;
      chainId?: number | null;
      resolver?: string | null;
      openInterest?: string | null;
      similarMarkets?: string[] | null;
    } | null,
    Error
  >({
    queryKey: ['conditionById', conditionId, resolverAddressFromUrl],
    enabled: Boolean(conditionId),
    queryFn: async () => {
      if (!conditionId) return null;
      const QUERY = /* GraphQL */ `
        query ConditionsByIds($where: ConditionWhereInput!) {
          conditions(where: $where, take: 1) {
            id
            question
            shortName
            endTime
            settled
            resolvedToYes
            nonDecisive
            description
            chainId
            resolver
            openInterest
            similarMarkets
            category {
              slug
            }
          }
        }
      `;
      // Build where clause with conditionId and optional resolver filter
      const whereClause: { AND: Array<Record<string, unknown>> } = {
        AND: [{ id: { in: [conditionId] } }],
      };
      if (resolverAddressFromUrl) {
        whereClause.AND.push({
          resolver: { equals: resolverAddressFromUrl, mode: 'insensitive' },
        });
      }
      const resp = await graphqlRequest<{
        conditions: Array<{
          id: string;
          question: string;
          shortName?: string | null;
          endTime?: number | null;
          settled?: boolean | null;
          resolvedToYes?: boolean | null;
          nonDecisive?: boolean | null;
          description?: string | null;
          category?: { slug: string } | null;
          chainId?: number | null;
          resolver?: string | null;
          openInterest?: string | null;
        }>;
      }>(QUERY, { where: whereClause });
      return resp?.conditions?.[0] || null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const handleForecastSuccess = React.useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Use chain/resolver from the condition - no fallbacks
  const chainId = data?.chainId ?? DEFAULT_CHAIN_ID;
  const resolverAddress = data?.resolver ?? undefined;

  const isPolymarketResolver =
    resolverAddress &&
    POLYMARKET_RESOLVER_ADDRESSES.has(resolverAddress.toLowerCase());
  const isPythResolver = inferResolverKind(resolverAddress) === 'pyth';

  const pythFeedUrl = useMemo(() => {
    if (!isPythResolver || !conditionId) return null;
    try {
      const decoded = decodePythMarketId(
        (conditionId.startsWith('0x')
          ? conditionId
          : `0x${conditionId}`) as `0x${string}`
      );
      if (!decoded) return null;
      const feedId = decodePythLazerFeedId(decoded.priceId);
      if (feedId == null) return null;
      const feed = PYTH_FEEDS.find((f) => f.lazerId === feedId);
      if (!feed?.symbol) return null;
      const slug = feed.symbol.replace(/[./]/g, '-').toLowerCase();
      return `https://www.pyth.network/price-feeds/${slug}`;
    } catch {
      return null;
    }
  }, [isPythResolver, conditionId]);

  const polymarketUrl = useMemo(() => {
    if (!isPolymarketResolver || !data?.similarMarkets) return null;
    const pm = data.similarMarkets.find((u) => u.includes('polymarket.com'));
    if (!pm) return null;
    // Handle both formats: full URL with /event/ path, or legacy #slug-only
    try {
      const parsed = new URL(pm);
      if (parsed.pathname !== '/') return pm;
      // Legacy format: https://polymarket.com#slug — not a navigable URL
      return null;
    } catch {
      return null;
    }
  }, [isPolymarketResolver, data?.similarMarkets]);

  // If the resolver in the URL is wrong, immediately canonicalize to the computed resolver.
  React.useEffect(() => {
    if (!resolverAddressFromUrl) return;
    if (!resolverAddress) return;
    if (
      resolverAddressFromUrl.toLowerCase() === resolverAddress.toLowerCase()
    ) {
      return;
    }
    router.replace(
      getQuestionHref({ conditionId, resolverAddress: resolverAddress })
    );
  }, [router, conditionId, resolverAddress, resolverAddressFromUrl]);

  // Fetch escrow predictions for this condition
  const { data: predictions, isLoading: isLoadingPredictions } =
    usePredictionsByConditionId({
      conditionId,
      take: 100,
    });

  // Fetch forecasts for this condition
  const { data: forecasts } = useForecasts({
    conditionId,
    options: {
      enabled: Boolean(conditionId),
    },
  });

  // Transform prediction data for scatter plot
  const scatterData = useMemo((): PredictionData[] => {
    if (!predictions || predictions.length === 0) {
      return [];
    }

    return predictions
      .map((pred) => {
        try {
          const picks = pred.pickConfig?.picks ?? [];
          // Find the pick matching the current conditionId
          const currentPick = picks.find(
            (p) => p.conditionId.toLowerCase() === conditionId.toLowerCase()
          );
          if (!currentPick) return null;

          const predictorPrediction =
            (currentPick.predictedOutcome as OutcomeSide) === OutcomeSide.YES;

          // Other picks become combined predictions
          const otherPicks = picks.filter(
            (p) => p.conditionId.toLowerCase() !== conditionId.toLowerCase()
          );
          const combinedPredictions: CombinedPrediction[] | undefined =
            otherPicks.length > 0
              ? otherPicks.map((p) => ({
                  conditionId: p.conditionId,
                  question: p.conditionId,
                  prediction:
                    (p.predictedOutcome as OutcomeSide) === OutcomeSide.YES,
                }))
              : undefined;

          const predictorCollateral = parseFloat(
            formatEther(BigInt(pred.predictorCollateral))
          );
          const counterpartyCollateral = parseFloat(
            formatEther(BigInt(pred.counterpartyCollateral))
          );
          const positionSize = predictorCollateral + counterpartyCollateral;

          // Implied probability of YES
          let predictionPercent = 50;
          if (positionSize > 0) {
            predictionPercent = predictorPrediction
              ? (predictorCollateral / positionSize) * 100
              : (counterpartyCollateral / positionSize) * 100;
            predictionPercent = Math.max(0, Math.min(100, predictionPercent));
          }

          // Use collateralDepositedAt (seconds) or createdAt
          const timestamp = pred.collateralDepositedAt
            ? pred.collateralDepositedAt * 1000
            : new Date(pred.createdAt).getTime();
          const date = new Date(timestamp);

          return {
            x: timestamp,
            y: predictionPercent,
            positionSize,
            predictor: pred.predictor,
            counterparty: pred.counterparty,
            predictorPrediction,
            predictorCollateral,
            counterpartyCollateral,
            time: date.toLocaleString(),
            combinedPredictions,
            combinedWithYes: predictorPrediction,
            marketAddress: pred.marketAddress,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PredictionData[];
  }, [predictions, conditionId]);

  // Calculate position size range from actual data for dynamic sizing
  const positionSizeRange = useMemo(() => {
    if (scatterData.length === 0) {
      return { positionSizeMin: 0, positionSizeMax: 100 };
    }
    const sizes = scatterData.map((d) => d.positionSize).filter((s) => s > 0);
    if (sizes.length === 0) {
      return { positionSizeMin: 0, positionSizeMax: 100 };
    }
    const positionSizeMin = Math.min(...sizes);
    const positionSizeMax = Math.max(...sizes);
    // If all position sizes are the same, add a small range to avoid division by zero
    if (positionSizeMin === positionSizeMax) {
      return {
        positionSizeMin: Math.max(0, positionSizeMin - 1),
        positionSizeMax: positionSizeMax + 1,
      };
    }
    return { positionSizeMin, positionSizeMax };
  }, [scatterData]);

  // Transform forecasts data for scatter plot
  // Forecasts are user-submitted probability predictions (not positions)
  const forecastScatterData = useMemo(() => {
    if (!forecasts || forecasts.length === 0) {
      return [];
    }

    const transformed = forecasts
      .map(
        (forecast: {
          value: string;
          rawTime: number;
          attester: string;
          comment?: string;
        }) => {
          try {
            // Parse prediction value (stored in D18 format: percentage * 10^18)
            let predictionPercent = 50; // Default fallback
            const predictionValue = forecast.value;
            if (predictionValue) {
              try {
                // Convert D18 to percentage (0-100)
                predictionPercent = Math.round(
                  d18ToPercentage(predictionValue)
                );
                // Clamp to 0-100 range
                predictionPercent = Math.max(
                  0,
                  Math.min(100, predictionPercent)
                );
              } catch (_error) {
                // Ignore conversion errors and fall back to default.
              }
            }

            // Convert time (Unix timestamp in seconds) to milliseconds
            const timestamp = forecast.rawTime * 1000;
            const date = new Date(timestamp);

            const result = {
              x: timestamp,
              y: predictionPercent,
              time: date.toLocaleString(),
              attester: forecast.attester,
              comment: forecast.comment || '',
            };

            return result;
          } catch (_error) {
            return null;
          }
        }
      )
      .filter(Boolean) as ForecastData[];

    return transformed;
  }, [forecasts]);

  // Computed flags for conditional rendering
  const hasPositions = predictions.length > 0;
  const hasForecasts = forecastScatterData.length > 0;
  const shouldShowChart = hasPositions || hasForecasts || isLoadingPredictions;

  type PrimaryTab =
    | 'predictions'
    | 'positions'
    | 'forecasts'
    | 'resolution'
    | 'agent'
    | 'techspecs';

  const TAB_VALUES: PrimaryTab[] = [
    'predictions',
    'positions',
    'forecasts',
    'resolution',
    'agent',
    'techspecs',
  ];

  const getTabFromHash = (): PrimaryTab | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.location.hash?.replace('#', '').toLowerCase();
    return (TAB_VALUES as string[]).includes(raw) ? (raw as PrimaryTab) : null;
  };

  // Keep primary tab controlled so we can default to Positions when available
  const [primaryTab, setPrimaryTab] = React.useState<PrimaryTab>('forecasts');
  const hashOverrideRef = React.useRef(false);

  // Read hash on mount
  React.useEffect(() => {
    const fromHash = getTabFromHash();
    if (fromHash) {
      setPrimaryTab(fromHash);
      hashOverrideRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for hashchange (browser back/forward)
  React.useEffect(() => {
    const onHashChange = () => {
      const fromHash = getTabFromHash();
      if (fromHash) setPrimaryTab(fromHash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrimaryTabChange = (value: string) => {
    const tab = value as PrimaryTab;
    setPrimaryTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${tab}`
      );
    }
  };

  const primaryTabValue = useMemo(() => {
    if (
      !hasPositions &&
      (primaryTab === 'predictions' || primaryTab === 'positions')
    ) {
      return 'forecasts';
    }
    return primaryTab;
  }, [hasPositions, primaryTab]);

  // Default to Positions once when they first become available; thereafter respect user choice
  const hasEverHadPositionsRef = React.useRef(hasPositions);
  React.useEffect(() => {
    if (hasPositions) {
      if (!hasEverHadPositionsRef.current && !hashOverrideRef.current) {
        setPrimaryTab('predictions');
      }
      hasEverHadPositionsRef.current = true;
    } else if (primaryTab === 'predictions') {
      setPrimaryTab('forecasts');
    }
  }, [hasPositions, primaryTab]);

  // Calculate X axis domain and ticks based on all chart data
  const { xDomain, xTicks, xTickLabels } = useMemo(() => {
    const allTimes = [
      ...scatterData.map((d) => d.x),
      ...forecastScatterData.map((d) => d.x),
    ];

    if (allTimes.length === 0) {
      const endTimeMs = data?.endTime ? data.endTime * 1000 : null;
      const now = Date.now();
      const right = endTimeMs && endTimeMs <= now ? endTimeMs : now;
      const weekAgo = right - 7 * 24 * 60 * 60 * 1000;
      return {
        xDomain: [weekAgo, right] as [number, number],
        xTicks: [weekAgo, weekAgo + (right - weekAgo) / 2, right],
        xTickLabels: {} as Record<number, string>,
      };
    }

    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    // Add some padding
    const range = maxTime - minTime || 24 * 60 * 60 * 1000;
    const padding = range * 0.1;

    // Cap the right edge at the condition's end time if it has ended
    const endTimeMs = data?.endTime ? data.endTime * 1000 : null;
    const rightEdge =
      endTimeMs && endTimeMs <= Date.now() ? endTimeMs : maxTime + padding;
    const domain: [number, number] = [minTime - padding, rightEdge];

    // Create evenly spaced ticks
    const tickCount = 5;
    const ticks: number[] = [];
    const labels: Record<number, string> = {};
    for (let i = 0; i < tickCount; i++) {
      const tick = domain[0] + (i * (domain[1] - domain[0])) / (tickCount - 1);
      ticks.push(tick);
      const date = new Date(tick);
      labels[tick] = `${date.getMonth() + 1}/${date.getDate()}`;
    }

    return { xDomain: domain, xTicks: ticks, xTickLabels: labels };
  }, [scatterData, forecastScatterData, data?.endTime]);

  // Disable logging - only CreatePositionForm should log auction activity
  const { bids, requestQuotes } = useAuctionStart({
    disableLogging: true,
    skipIntentSigning: true,
  });
  if (isLoading) {
    return (
      <div
        className="flex justify-center items-center w-full"
        style={{
          minHeight: 'calc(100dvh - var(--page-top-offset, 0px))',
        }}
      >
        <Loader className="w-4 h-4" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="flex flex-col items-center justify-center w-full gap-4"
        style={{
          minHeight: 'calc(100dvh - var(--page-top-offset, 0px))',
        }}
      >
        <p className="text-destructive">Failed to load question.</p>
      </div>
    );
  }

  const displayTitle = data.question || data.shortName || '';

  const categorySlug = data.category?.slug;

  const renderPredictionFormCard = () => (
    <PredictionForm
      conditionId={conditionId}
      question={data.question || ''}
      shortName={data.shortName}
      categorySlug={data.category?.slug}
      resolverAddress={resolverAddress}
      chainId={chainId}
      bids={bids}
      requestQuotes={requestQuotes}
      settled={data.settled}
      resolvedToYes={data.resolvedToYes}
      nonDecisive={data.nonDecisive}
      endTime={data.endTime}
    />
  );

  const renderTechSpecsCard = (withBorder = true) => (
    <div
      className={`${
        withBorder ? 'border border-border rounded-lg' : ''
      } bg-brand-black p-0 overflow-hidden`}
    >
      <TechSpecTable
        conditionId={conditionId}
        chainId={data.chainId ?? 42161}
        endTime={data?.endTime ?? null}
        settled={data?.settled ?? null}
        resolvedToYes={data?.resolvedToYes ?? null}
        nonDecisive={data?.nonDecisive ?? null}
        resolverAddress={resolverAddress}
      />
    </div>
  );

  const renderScatterPlotCard = () => (
    <div
      className={`relative w-full min-w-0 bg-brand-black border border-border rounded-lg pt-6 pr-8 pb-2 pl-2 min-h-[320px] h-[320px] sm:h-[360px] ${
        data?.settled ? 'lg:h-[205px] lg:min-h-0' : 'lg:min-h-[350px] lg:h-full'
      }`}
      // Explicit height on small screens so Recharts can compute dimensions
      // When settled, use fixed height on desktop; otherwise let grid stretch fill the height
    >
      <PredictionScatterChart
        scatterData={scatterData}
        forecastScatterData={forecastScatterData}
        isLoading={isLoadingPredictions}
        positionSizeRange={positionSizeRange}
        xDomain={xDomain}
        xTicks={xTicks}
        xTickLabels={xTickLabels}
      />
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col gap-4">
      {renderPredictionFormCard()}
      {renderTechSpecsCard()}
    </div>
  );

  const mobileTabs = (
    <Tabs
      value={primaryTabValue}
      onValueChange={handlePrimaryTabChange}
      className="w-full min-w-0"
    >
      <div className="border border-border rounded-lg overflow-hidden bg-brand-black w-full min-w-0">
        {/* Header with all tabs */}
        <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10 overflow-x-auto">
          <TabsList className="h-auto p-0 bg-transparent gap-2 flex-nowrap">
            {hasPositions && (
              <>
                <TabsTrigger
                  value="predictions"
                  className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger
                  value="positions"
                  className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Positions
                </TabsTrigger>
              </>
            )}
            <TabsTrigger
              value="forecasts"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Telescope className="h-3.5 w-3.5" />
              Forecasts
            </TabsTrigger>
            <TabsTrigger
              value="resolution"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Handshake className="h-3.5 w-3.5" />
              Resolution
            </TabsTrigger>
            <TabsTrigger
              value="agent"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bot className="h-3.5 w-3.5" />
              Agent
            </TabsTrigger>
            <TabsTrigger
              value="techspecs"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" />
              Tech Specs
            </TabsTrigger>
          </TabsList>
        </div>
        {/* Content area - Predictions */}
        <TabsContent value="predictions" className="m-0">
          <ActivityTable conditionId={conditionId} />
        </TabsContent>
        {/* Content area - Positions */}
        <TabsContent value="positions" className="m-0">
          <PositionsTable conditionId={conditionId} showHeaderText={false} />
        </TabsContent>
        {/* Content area - Forecasts */}
        <TabsContent value="forecasts" className="m-0">
          {!data?.settled && (
            <div className="p-4 border-b border-border/60">
              <ConditionForecastForm
                conditionId={conditionId}
                resolver={data.resolver ?? ''}
                question={data.question || ''}
                endTime={data.endTime ?? undefined}
                categorySlug={data.category?.slug}
                onSuccess={handleForecastSuccess}
              />
            </div>
          )}
          <Comments
            selectedCategory={CommentFilters.SelectedQuestion}
            question={data.question}
            conditionId={conditionId}
            refetchTrigger={refetchTrigger}
          />
        </TabsContent>
        {/* Content area - Resolution */}
        <TabsContent value="resolution" className="m-0 p-4">
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <ResolverBadge
              resolverAddress={resolverAddress}
              size="normal"
              appearance="brandWhite"
            />
            <EndTimeDisplay
              endTime={data.endTime ?? null}
              settled={data.settled}
              size="normal"
              appearance="brandWhite"
            />
            {polymarketUrl && (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border border-brand-white/20 bg-card px-3.5 text-sm font-medium leading-none text-brand-white hover:opacity-70 transition-opacity"
              >
                <Image
                  src="/polymarket-logomark.png"
                  alt="Polymarket"
                  width={24}
                  height={24}
                  className="mr-1.5 h-4 w-4"
                />
                View on Polymarket
              </a>
            )}
            {pythFeedUrl && (
              <a
                href={pythFeedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border border-brand-white/20 bg-card px-3.5 text-sm font-medium leading-none text-brand-white hover:opacity-70 transition-opacity"
              >
                <PythOracleMark
                  className="mr-1.5 h-4 w-4 text-foreground/80"
                  src="/pyth-network.svg"
                  alt="Pyth Network"
                />
                View on Pyth
              </a>
            )}
          </div>
          {data.description ? (
            <div className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90">
              <SafeMarkdown
                content={data.description}
                className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
              />
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              No resolution criteria available.
            </span>
          )}
        </TabsContent>
        {/* Content area - Agent */}
        <TabsContent value="agent" className="m-0">
          <ResearchAgent
            question={data.question}
            endTime={data.endTime}
            description={data.description}
          />
        </TabsContent>
        {/* Content area - Tech Specs */}
        <TabsContent value="techspecs" className="m-0">
          {renderTechSpecsCard(false)}
        </TabsContent>
      </div>
    </Tabs>
  );

  const desktopTabs = (
    <Tabs
      value={primaryTabValue}
      onValueChange={handlePrimaryTabChange}
      className="w-full min-w-0"
    >
      <div className="border border-border rounded-lg overflow-hidden bg-brand-black w-full min-w-0">
        {/* Header with integrated tabs */}
        <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10">
          <TabsList className="h-auto p-0 bg-transparent gap-2">
            {hasPositions && (
              <>
                <TabsTrigger
                  value="predictions"
                  className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger
                  value="positions"
                  className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Positions
                </TabsTrigger>
              </>
            )}
            <TabsTrigger
              value="forecasts"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
            >
              <Telescope className="h-3.5 w-3.5" />
              Forecasts
            </TabsTrigger>
            <TabsTrigger
              value="resolution"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
            >
              <Handshake className="h-3.5 w-3.5" />
              Resolution
            </TabsTrigger>
            <TabsTrigger
              value="agent"
              className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
            >
              <Bot className="h-3.5 w-3.5" />
              Agent
            </TabsTrigger>
          </TabsList>
        </div>
        {/* Content area */}
        <TabsContent value="predictions" className="m-0">
          <ActivityTable conditionId={conditionId} />
        </TabsContent>
        <TabsContent value="positions" className="m-0">
          <PositionsTable conditionId={conditionId} showHeaderText={false} />
        </TabsContent>
        <TabsContent value="forecasts" className="m-0">
          {!data?.settled && (
            <div className="p-4 border-b border-border/60">
              <ConditionForecastForm
                conditionId={conditionId}
                resolver={data.resolver ?? ''}
                question={data.question || ''}
                endTime={data.endTime ?? undefined}
                categorySlug={data.category?.slug}
                onSuccess={handleForecastSuccess}
              />
            </div>
          )}
          <Comments
            selectedCategory={CommentFilters.SelectedQuestion}
            question={data.question}
            conditionId={conditionId}
            refetchTrigger={refetchTrigger}
          />
        </TabsContent>
        <TabsContent value="resolution" className="m-0 p-4">
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <ResolverBadge
              resolverAddress={resolverAddress}
              size="normal"
              appearance="brandWhite"
            />
            <EndTimeDisplay
              endTime={data.endTime ?? null}
              settled={data.settled}
              size="normal"
              appearance="brandWhite"
            />
            {polymarketUrl && (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border border-brand-white/20 bg-card px-3.5 text-sm font-medium leading-none text-brand-white hover:opacity-70 transition-opacity"
              >
                <Image
                  src="/polymarket-logomark.png"
                  alt="Polymarket"
                  width={24}
                  height={24}
                  className="mr-1.5 h-4 w-4"
                />
                View on Polymarket
              </a>
            )}
            {pythFeedUrl && (
              <a
                href={pythFeedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full border border-brand-white/20 bg-card px-3.5 text-sm font-medium leading-none text-brand-white hover:opacity-70 transition-opacity"
              >
                <PythOracleMark
                  className="mr-1.5 h-4 w-4 text-foreground/80"
                  src="/pyth-network.svg"
                  alt="Pyth Network"
                />
                View on Pyth
              </a>
            )}
          </div>
          {data.description ? (
            <div className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90">
              <SafeMarkdown
                content={data.description}
                className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
              />
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              No resolution criteria available.
            </span>
          )}
        </TabsContent>
        <TabsContent value="agent" className="m-0">
          <ResearchAgent
            question={data.question}
            endTime={data.endTime}
            description={data.description}
          />
        </TabsContent>
      </div>
    </Tabs>
  );

  return (
    <div
      className="flex flex-col w-full"
      style={{ minHeight: 'calc(100dvh - var(--page-top-offset, 0px))' }}
    >
      <div className="flex flex-col w-full px-4 md:px-6 lg:px-8 items-center">
        {/* Main content */}
        <div className={`w-full mt-4 md:mt-8 max-w-[900px]`}>
          {/* Title */}
          <h1 className="text-3xl lg:text-4xl font-normal text-foreground mb-4 break-words">
            {displayTitle}
          </h1>

          {/* Badges Row: Category, Open Interest, End Time */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Focus Area Badge */}
            {categorySlug && <FocusAreaBadge categorySlug={categorySlug} />}

            {/* Open Interest Badge */}
            {(() => {
              return (
                <Badge
                  variant="outline"
                  className="h-9 items-center px-3.5 text-sm leading-none inline-flex bg-card border-brand-white/20 text-brand-white font-medium"
                >
                  <DollarSign className="h-4 w-4 mr-1.5 -mt-[1px] opacity-70" />
                  Open Interest
                  <span
                    aria-hidden="true"
                    className="hidden md:inline-block mx-2.5 h-4 w-px bg-muted-foreground/30"
                  />
                  <span className="whitespace-nowrap text-foreground font-normal ml-1.5 md:ml-0">
                    {(() => {
                      // Get open interest from data and format it
                      const openInterestWei = data?.openInterest || '0';
                      try {
                        const etherValue = parseFloat(
                          formatEther(BigInt(openInterestWei))
                        );
                        const formattedValue = etherValue.toFixed(2);
                        return `${formattedValue} USDe`;
                      } catch {
                        return '0 USDe';
                      }
                    })()}
                  </span>
                </Badge>
              );
            })()}

            {/* End Time Badge */}
            <EndTimeDisplay
              endTime={data.endTime ?? null}
              settled={data.settled}
              size="large"
              appearance="brandWhite"
            />
          </div>

          {/* When we have chart data, keep scatter plot on the left and sidebar cards on the right */}
          {shouldShowChart && (
            <>
              <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 mb-6 items-stretch">
                {renderScatterPlotCard()}
                {sidebarContent}
              </div>

              <div className="lg:hidden flex flex-col gap-6 mb-12">
                {renderPredictionFormCard()}
                {renderScatterPlotCard()}
                {renderTechSpecsCard()}
                {mobileTabs}
              </div>
            </>
          )}

          {/* When there is no chart data, use the tabs in the left slot and keep sidebar on the right */}
          {!shouldShowChart && (
            <>
              <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 mb-6 items-stretch">
                <div className="min-w-0">{desktopTabs}</div>
                {sidebarContent}
              </div>
              <div className="lg:hidden flex flex-col gap-6 mb-12">
                {renderPredictionFormCard()}
                {renderTechSpecsCard()}
                {mobileTabs}
              </div>
            </>
          )}

          {/* Desktop tabs: show here only when the chart is present (otherwise rendered in grid) */}
          {shouldShowChart && (
            <div className="hidden lg:block mb-12">{desktopTabs}</div>
          )}
        </div>
      </div>

      <style jsx global>
        {scatterChartStyles}
      </style>
    </div>
  );
}
