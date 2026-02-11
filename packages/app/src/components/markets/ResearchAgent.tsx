'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { ChatMessages } from '~/components/shared/chat/ChatMessages';
import { ChatInput } from '~/components/shared/chat/ChatInput';
import type { ChatMessage } from '~/components/shared/chat/types';
import { useSettings } from '~/lib/context/SettingsContext';
import RiskDisclaimer from '~/components/markets/forms/shared/RiskDisclaimer';

// Generate a stable storage key for chat history based on question
function getStorageKey(question?: string | null): string {
  const base = 'sapience-research-chat';
  if (!question) return base;
  // Simple hash for shorter keys
  const hash = question
    .split('')
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    .toString(36);
  return `${base}-${hash}`;
}

function formatTimestamp(ts?: number | null) {
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
  question,
  endTime,
  description,
}: {
  baseSystem: string;
  question?: string | null;
  endTime?: number | null;
  description?: string | null;
}) {
  const lines: string[] = [];

  if (question) {
    lines.push(
      `The prediction market participant is currently viewing: ${question}`
    );
  }
  if (endTime && Number.isFinite(endTime)) {
    lines.push(`Ends: ${formatTimestamp(endTime)}`);
  }
  if (description) {
    lines.push(`Resolution criteria: ${description}`);
  }

  const sys = [baseSystem?.trim() || '', lines.join('\n')]
    .filter(Boolean)
    .join('\n\n');
  return sys;
}

interface ResearchAgentProps {
  question?: string | null;
  endTime?: number | null;
  description?: string | null;
}

const ResearchAgent: React.FC<ResearchAgentProps> = ({
  question,
  endTime,
  description,
}) => {
  const {
    openrouterApiKey,
    researchAgentModel,
    researchAgentSystemMessage,
    defaults,
    researchAgentTemperature,
  } = useSettings();

  const storageKey = useMemo(() => getStorageKey(question), [question]);

  // Initialize messages from sessionStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  const [pendingText, setPendingText] = useState<string>('');
  const [isRequestInFlight, setIsRequestInFlight] = useState<boolean>(false);
  // Track if welcome message was added (also true if we loaded history)
  const addedWelcomeRef = useRef(messages.length > 0);

  // Persist messages to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }, [messages, storageKey]);

  const modelToUse = useMemo(
    () => researchAgentModel || defaults.researchAgentModel,
    [researchAgentModel, defaults.researchAgentModel]
  );

  const canChat = Boolean(openrouterApiKey);
  const canType = true; // Always allow typing, even while loading

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

  // Prefill the input with the question (one-time)
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (didPrefillRef.current) return;
    if (
      !pendingText &&
      typeof question === 'string' &&
      question.trim().length > 0
    ) {
      setPendingText(question.trim());
      didPrefillRef.current = true;
    }
  }, [question, pendingText]);

  const handleSend = async () => {
    const text = pendingText.trim();
    if (!text) return;
    if (isRequestInFlight) return;

    // Append user message
    const userMsg: ChatMessage = {
      id: `${Date.now()}-me`,
      author: 'me',
      text,
    };

    const baseSystem = researchAgentSystemMessage || '';
    const systemText = buildSystemContext({
      baseSystem,
      question,
      endTime,
      description,
    });

    try {
      if (typeof console !== 'undefined') {
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
        const isAuthError = resp.status === 401;
        const errorText = isAuthError
          ? 'Your API key appears to be invalid or expired. Please check your [settings](/settings#agent) to update it.'
          : `Something went wrong: ${json?.error || `Error ${resp.status}`}`;
        const err: ChatMessage = {
          id: `${Date.now()}-err`,
          author: 'server',
          text: errorText,
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
      const errorMessage = (e as Error)?.message || 'Network error';
      const err: ChatMessage = {
        id: `${Date.now()}-err2`,
        author: 'server',
        text: `Unable to connect: ${errorMessage}. Please try again.`,
      };
      setMessages((prev) => [...prev, err]);
    } finally {
      setIsRequestInFlight(false);
    }
  };

  return (
    <div className="flex flex-col">
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
            <Bot
              className="h-9 w-9 mx-auto mb-2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div className="mb-0 max-w-[250px]">
              Add an{' '}
              <a
                href="https://openrouter.ai"
                target="_blank"
                rel="noreferrer"
                className="gold-link"
              >
                OpenRouter
              </a>{' '}
              API key in your{' '}
              <Link href="/settings#agent" className="gold-link">
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
        <RiskDisclaimer message="Agents make mistakes; check important info" />
      </div>
    </div>
  );
};

export default ResearchAgent;
