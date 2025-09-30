'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@sapience/ui/components/ui/card';
import Link from 'next/link';
import { Bot } from 'lucide-react';
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

  // Group markets by end time to mirror chart legend grouping
  const byEnd: Record<number, any[]> = {};
  for (const m of markets) {
    const end = Number(m?.endTimestamp);
    if (Number.isFinite(end)) {
      if (!byEnd[end]) byEnd[end] = [];
      byEnd[end].push(m);
    }
  }
  const times = Object.keys(byEnd)
    .map(Number)
    .sort((a, b) => a - b);
  const futureTimes = times.filter((t) => t > nowSec);
  const selectedEnd =
    futureTimes.length > 0 ? futureTimes[0] : times[times.length - 1];
  const groupMarkets = selectedEnd != null ? byEnd[selectedEnd] || [] : [];

  // Prefer active group question, then group question fallback
  const activeQuestion =
    groupMarkets.find((m: any) => m?.question)?.question || mg.question || null;

  const lines: string[] = [];
  if (activeQuestion) {
    lines.push(
      `The prediction market participant is currently viewing: ${String(activeQuestion)}`
    );
  }
  if (Number.isFinite(selectedEnd)) {
    lines.push(`Ends: ${formatSeconds(Number(selectedEnd))}`);
  }
  if (summaryExtraLine) {
    lines.push(summaryExtraLine);
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
    researchAgentTemperature,
  } = useSettings();
  const params = useParams();

  const [messages, setMessages] = useState<ChatMessage[]>(() => []);
  const [pendingText, setPendingText] = useState<string>('');
  const [isRequestInFlight, setIsRequestInFlight] = useState<boolean>(false);
  const addedWelcomeRef = useRef(false);

  const modelToUse = useMemo(
    () => researchAgentModel || defaults.researchAgentModel,
    [researchAgentModel, defaults.researchAgentModel]
  );

  const canChat = Boolean(openrouterApiKey);
  // Allow typing even if API key is missing; we'll disable sending instead
  const canType = !isRequestInFlight;

  // Add a welcome message once when chat becomes available
  useEffect(() => {
    if (!canChat) return;
    if (addedWelcomeRef.current) return;
    if (messages.length === 0) {
      setMessages([
        {
          id: `${Date.now()}-asst-welcome`,
          author: 'server',
          text: 'Hi!',
        },
      ]);
      addedWelcomeRef.current = true;
    }
  }, [canChat, messages, setMessages]);

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
      // For multiple choice: "[option]: X% Chance"
      // For single choice: "Current Market Prediction: X% Chance"
      if (isMultipleChoice) {
        const optSuffix = yAxisConfig.unit === '%' ? ' Chance' : '';
        lines.push(`${label}: ${formatValue(value)}${optSuffix}`);
      } else {
        lines.push(`${label}: ${formatValue(value)}${suffix}`);
      }
    });
    // Omit index line for simplified context

    return lines.join('\n');
  }, [
    overallLatestDataPoint,
    chartMarketIds,
    chartOptionNames,
    yAxisConfig,
    hasIndexData,
    latestIndexValue,
  ]);

  // Always render the chat UI; if no API key, show a notice and disable sending

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
    try {
      if (typeof console !== 'undefined') {
        // Log the system message used to initialize the agent turn
        console.log('[ResearchAgent] system message:', systemText);
      }
    } catch {
      console.error(
        '[ResearchAgent] error logging system message:',
        systemText
      );
    }

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
          temperature:
            typeof researchAgentTemperature === 'number'
              ? researchAgentTemperature
              : undefined,
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
    }
  };

  return (
    <Card className="shadow-sm border bg-card rounded-sm">
      {canChat ? (
        <ChatMessages
          messages={messages}
          showLoader={false}
          showTyping={isRequestInFlight}
          className="h-64"
          labels={{ me: 'You', server: 'Agent' }}
        />
      ) : (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-8 px-6">
            <Bot className="h-9 w-9 mx-auto mb-2 opacity-20" />
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
                href="/settings#agent"
                className="transition-colors underline decoration-1 decoration-foreground/10 underline-offset-4 hover:decoration-foreground/60"
              >
                settings
              </Link>{' '}
              to enable the agent.
            </div>
          </div>
        </div>
      )}
      <ChatInput
        value={pendingText}
        onChange={setPendingText}
        onSend={handleSend}
        canChat={true}
        canType={canType}
        sendDisabled={!canChat || !pendingText.trim() || isRequestInFlight}
        onLogin={() => {}}
      />
      <div className="px-3 pb-3">
        <WagerDisclaimer message="Agents make mistakes. Always check important info." />
      </div>
    </Card>
  );
};

export default ResearchAgent;
