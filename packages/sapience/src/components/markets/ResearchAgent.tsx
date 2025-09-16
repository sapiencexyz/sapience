'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@sapience/ui/components/ui/card';
import Link from 'next/link';
import { FrownIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ChatMessages } from '~/components/shared/chat/ChatMessages';
import { ChatInput } from '~/components/shared/chat/ChatInput';
import type { ChatMessage } from '~/components/shared/chat/types';
import { useSettings } from '~/lib/context/SettingsContext';
import { useMarketGroupPage } from '~/lib/context/MarketGroupPageProvider';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import {
  transformMarketGroupChartData,
  type MultiMarketChartDataPoint,
} from '~/lib/utils/chartUtils';
import { getYAxisConfig, parseUrlParameter } from '~/lib/utils/util';

function formatSeconds(ts?: number) {
  if (!ts || Number.isNaN(ts)) return '';
  try {
    const d = new Date(ts * 1000);
    return d.toISOString();
  } catch {
    return String(ts);
  }
}

function buildMarketSummary(mg: any): string | null {
  if (!mg) return null;
  const markets = Array.isArray(mg.markets) ? mg.markets : [];

  // Prefer group question; fall back to an active market's question/option
  const questionCandidate =
    mg.question ||
    markets.find((m: any) => m?.question)?.question ||
    markets.find((m: any) => m?.optionName)?.optionName ||
    null;

  // Collect unique, non-empty option names
  const optionNames = Array.from(
    new Set(
      markets
        .map((m: any) => (m?.optionName ?? '').toString().trim())
        .filter((s: string) => s.length > 0)
    )
  );

  const hasMultipleOptions = optionNames.length >= 2;

  const parts: string[] = [];
  if (questionCandidate) {
    parts.push(
      `The prediction market participant is assessing ${questionCandidate}.`
    );
  }

  if (hasMultipleOptions) {
    const optionsSentence =
      optionNames.length === 2
        ? `The options are ${optionNames[0]} and ${optionNames[1]}.`
        : `The options are ${optionNames.slice(0, -1).join(', ')}, and ${optionNames[optionNames.length - 1]}.`;
    parts.push(optionsSentence);
  }

  // Future: append price/probability once reliably available here
  // e.g., "The current market prediction is 64% (price 0.64 per Yes share)."

  const summary = parts.join(' ').trim();
  return summary || null;
}

function buildSystemContext({
  baseSystem,
  marketGroup,
  summaryExtraLine,
}: {
  baseSystem: string;
  marketGroup: any;
  summaryExtraLine?: string | null;
}) {
  const mg = marketGroup || {};
  const markets = Array.isArray(mg.markets) ? mg.markets : [];
  const nowSec = Date.now() / 1000;
  const future = markets
    .filter(
      (m: any) => typeof m.endTimestamp === 'number' && m.endTimestamp > nowSec
    )
    .sort((a: any, b: any) => a.endTimestamp - b.endTimestamp);
  const active = future[0] || markets[0] || null;

  const lines: string[] = [];
  const summary = buildMarketSummary(mg);
  if (summary) lines.push(summary);
  if (summaryExtraLine) lines.push(summaryExtraLine);
  if (summary || summaryExtraLine) lines.push('');
  lines.push('Context:');
  if (mg.address) lines.push(`- Group address: ${mg.address}`);
  if (mg.chainId != null) lines.push(`- Chain ID: ${mg.chainId}`);
  if (mg.question) lines.push(`- Group question: ${String(mg.question)}`);
  if (mg.category?.name || mg.category?.slug)
    lines.push(`- Category: ${mg.category?.name || mg.category?.slug}`);
  lines.push(`- Markets count: ${markets.length}`);
  if (active) {
    lines.push('- Active market:');
    if (active.marketId != null)
      lines.push(`  - marketId: ${Number(active.marketId)}`);
    if (active.question) lines.push(`  - question: ${String(active.question)}`);
    if (active.optionName)
      lines.push(`  - option: ${String(active.optionName)}`);
    if (active.startTimestamp)
      lines.push(`  - start: ${formatSeconds(Number(active.startTimestamp))}`);
    if (active.endTimestamp)
      lines.push(`  - end: ${formatSeconds(Number(active.endTimestamp))}`);
    if (active.poolAddress)
      lines.push(`  - poolAddress: ${String(active.poolAddress)}`);
  }

  const sys = [baseSystem?.trim() || '', lines.join('\n')]
    .filter(Boolean)
    .join('\n\n');
  return sys;
}

const ResearchAgent: React.FC = () => {
  const { marketGroupData } = useMarketGroupPage();
  const {
    openrouterApiKey,
    researchAgentModel,
    researchAgentSystemMessage,
    defaults,
  } = useSettings();
  const params = useParams();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: `${Date.now()}-asst-welcome`,
      author: 'server',
      text: "Hi! Let's chat about this question.",
    },
  ]);
  const [pendingText, setPendingText] = useState<string>('');
  const [isRequestInFlight, setIsRequestInFlight] = useState<boolean>(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const modelToUse = useMemo(
    () => researchAgentModel || defaults.researchAgentModel,
    [researchAgentModel, defaults.researchAgentModel]
  );

  const canChat = Boolean(openrouterApiKey);
  const canType = canChat && !isRequestInFlight;

  // Prefill the input with the market group's question (one-time)
  const derivedQuestion: string | null = useMemo(() => {
    const mg = marketGroupData as any;
    if (!mg) return null;
    const direct = mg?.question ? String(mg.question) : null;
    if (direct && direct.trim().length > 0) return direct.trim();
    const markets = Array.isArray(mg.markets) ? mg.markets : [];
    const firstWithQuestion = markets.find((m: any) => m?.question);
    const q = firstWithQuestion?.question
      ? String(firstWithQuestion.question)
      : null;
    return q && q.trim().length > 0 ? q.trim() : null;
  }, [marketGroupData]);

  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (didPrefillRef.current) return;
    if (
      !pendingText &&
      typeof derivedQuestion === 'string' &&
      derivedQuestion.length > 0
    ) {
      setPendingText(derivedQuestion);
      didPrefillRef.current = true;
    }
  }, [derivedQuestion, pendingText]);

  // Derive the same inputs the chart/legend use
  const paramString = (params as any)?.chainShortName as string | undefined;
  const { chainShortName, marketAddress } = useMemo(
    () =>
      paramString
        ? parseUrlParameter(paramString)
        : { chainShortName: undefined, marketAddress: undefined },
    [paramString]
  );

  function getMarketsGroupedByEndTime(markets: any[]) {
    const currentTimeSeconds = Date.now() / 1000;
    const byEnd: Record<number, any[]> = {};
    for (const market of markets) {
      const end = market?.endTimestamp;
      if (typeof end === 'number' && !Number.isNaN(end)) {
        if (!byEnd[end]) byEnd[end] = [];
        byEnd[end].push(market);
      }
    }
    const times = Object.keys(byEnd)
      .map(Number)
      .sort((a, b) => a - b);
    const future = times.filter((t) => t > currentTimeSeconds);
    if (future.length > 0)
      return { markets: byEnd[future[0]], endTime: future[0], isFuture: true };
    const past = times.filter((t) => t <= currentTimeSeconds);
    if (past.length > 0) {
      const last = past[past.length - 1];
      return { markets: byEnd[last], endTime: last, isFuture: false };
    }
    return null;
  }

  const chartScope = useMemo(() => {
    const markets = Array.isArray(marketGroupData?.markets)
      ? (marketGroupData.markets as any[])
      : [];
    if (markets.length === 0) return { chartMarkets: [] as any[] };
    const group = getMarketsGroupedByEndTime(markets);
    const chartMarkets = group?.markets
      ? group.markets
          .slice()
          .sort((a: any, b: any) => Number(a.marketId) - Number(b.marketId))
      : ([] as any[]);
    return { chartMarkets };
  }, [marketGroupData?.markets]);

  const chartMarketIds = useMemo(
    () => chartScope.chartMarkets.map((m: any) => Number(m.marketId)),
    [chartScope.chartMarkets]
  );
  const chartOptionNames = useMemo(
    () => chartScope.chartMarkets.map((m: any) => m?.optionName || ''),
    [chartScope.chartMarkets]
  );

  const { chartData } = useMarketGroupChartData({
    chainShortName: chainShortName as string,
    marketAddress: marketAddress as string,
    activeMarketIds: chartMarketIds,
    quoteTokenName: marketGroupData?.quoteTokenName ?? undefined,
    hasResource: !!marketGroupData?.resource,
  });

  const processedData = useMemo(
    () => transformMarketGroupChartData(chartData, { startAtFirstTrade: true }),
    [chartData]
  );
  const yAxisConfig = useMemo(
    () => getYAxisConfig(marketGroupData),
    [marketGroupData]
  );
  const hasIndexData = useMemo(
    () => processedData.some((d) => d.indexClose != null),
    [processedData]
  );
  const latestIndexValue = useMemo(() => {
    for (let i = processedData.length - 1; i >= 0; i--) {
      const p = processedData[i];
      if (p && typeof p.indexClose === 'number' && !Number.isNaN(p.indexClose))
        return p.indexClose;
    }
    return null;
  }, [processedData]);
  const overallLatestDataPoint: MultiMarketChartDataPoint | null = useMemo(
    () =>
      processedData.length > 0 ? processedData[processedData.length - 1] : null,
    [processedData]
  );

  const currentValuesLine: string | null = useMemo(() => {
    if (!overallLatestDataPoint) return null;
    if (!Array.isArray(chartMarketIds) || chartMarketIds.length === 0)
      return null;

    const isMultipleChoice = Boolean(
      chartOptionNames && chartOptionNames.length > 1
    );
    const MARKET_PREDICTION_LABEL = 'Market Prediction';
    const formatValue = (val?: number | null) =>
      val == null ? '--' : yAxisConfig.tooltipValueFormatter(val);

    const lines: string[] = [];
    lines.push('Current values:');
    chartMarketIds.forEach((marketId, index) => {
      const value = overallLatestDataPoint.markets?.[
        String(marketId) as keyof typeof overallLatestDataPoint.markets
      ] as number | null | undefined;
      const baseLabel =
        chartOptionNames?.length === 1
          ? MARKET_PREDICTION_LABEL
          : chartOptionNames?.[index] || MARKET_PREDICTION_LABEL;
      const label = isMultipleChoice ? baseLabel : `Current ${baseLabel}`;
      const suffix =
        baseLabel === MARKET_PREDICTION_LABEL &&
        !isMultipleChoice &&
        yAxisConfig.unit === '%'
          ? ' Chance'
          : '';
      lines.push(`- ${label}: ${formatValue(value)}${suffix}`);
    });
    if (hasIndexData) {
      lines.push(`- Index: ${formatValue(latestIndexValue)}`);
    }

    return lines.join('\n');
  }, [
    overallLatestDataPoint,
    chartMarketIds,
    chartOptionNames,
    yAxisConfig,
    hasIndexData,
    latestIndexValue,
  ]);

  if (!canChat) {
    return (
      <div className="bg-background dark:bg-muted/50 border border-border rounded shadow-sm p-8">
        <div className="text-center text-muted-foreground py-8">
          <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
          <div className="mb-0">
            Add an{' '}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noreferrer"
              className="transition-colors underline decoration-1 decoration-foreground/10 underline-offset-4 hover:decoration-foreground/60"
            >
              OpenRouter
            </a>{' '}
            API key in your{' '}
            <Link
              href="/settings#research-agent"
              className="transition-colors underline decoration-1 decoration-foreground/10 underline-offset-4 hover:decoration-foreground/60"
            >
              settings
            </Link>{' '}
            to enable the research agent.
          </div>
        </div>
      </div>
    );
  }

  const handleSend = async () => {
    const text = pendingText.trim();
    if (!text) return;
    if (isRequestInFlight) return;

    // append user message
    const userMsg: ChatMessage = {
      id: `${Date.now()}-me`,
      author: 'me',
      text,
    };
    const baseSystem = researchAgentSystemMessage || '';
    const systemText = buildSystemContext({
      baseSystem,
      marketGroup: marketGroupData,
      summaryExtraLine: currentValuesLine,
    });

    const pastMessages: { role: 'user' | 'assistant'; content: string }[] =
      messages
        .filter((m) => m.author === 'me' || m.author === 'server')
        .map((m) => ({
          role: m.author === 'me' ? 'user' : 'assistant',
          content: m.text,
        }));

    const turnMessages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [
      { role: 'system', content: systemText },
      ...pastMessages,
      { role: 'user', content: text },
    ];

    setPendingText('');
    setMessages((prev) => [...prev, userMsg]);
    setIsRequestInFlight(true);
    try {
      const resp = await fetch('/api/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: turnMessages,
          model: modelToUse,
          apiKey: openrouterApiKey,
          headers: {
            referer:
              typeof window !== 'undefined' ? window.location.href : undefined,
            title: typeof document !== 'undefined' ? document.title : undefined,
          },
          stream: false,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const errorMsg = json?.error || `Error ${resp.status}`;
        const err: ChatMessage = {
          id: `${Date.now()}-err`,
          author: 'server',
          text: '',
          error:
            resp.status === 401
              ? 'Unauthorized from OpenRouter. Recheck your API key.'
              : errorMsg,
        };
        setMessages((prev) => [...prev, err]);
        return;
      }

      // OpenRouter response shape: { choices: [{ message: { role, content } }] }
      const content: string = json?.choices?.[0]?.message?.content || '';
      const assistantMsg: ChatMessage = {
        id: `${Date.now()}-asst`,
        author: 'server',
        text: typeof content === 'string' ? content : JSON.stringify(content),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const err: ChatMessage = {
        id: `${Date.now()}-err2`,
        author: 'server',
        text: '',
        error: (e as Error)?.message || 'Network error',
      };
      setMessages((prev) => [...prev, err]);
    } finally {
      setIsRequestInFlight(false);
      scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <Card className="shadow-sm border bg-background/95">
      <ChatMessages
        messages={messages}
        showLoader={messages.length === 0}
        showTyping={isRequestInFlight}
        className="h-64"
      />
      <ChatInput
        value={pendingText}
        onChange={setPendingText}
        onSend={handleSend}
        canChat={true}
        canType={canType}
        onLogin={() => {}}
      />
      <div className="px-3 pb-3">
        <WagerDisclaimer message="Agents can make mistakes. Check important info." />
      </div>
      <div ref={scrollAnchorRef} />
    </Card>
  );
};

export default ResearchAgent;
