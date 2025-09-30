'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import LottieLoader from '~/components/shared/LottieLoader';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import EnsAvatar from '~/components/shared/EnsAvatar';

type Props = {
  messages: ChatMessage[];
  showLoader: boolean;
  showTyping?: boolean;
  className?: string;
  labels?: {
    me?: string;
    server?: string;
    system?: string;
  };
};

export function ChatMessages({
  messages,
  showLoader,
  showTyping = false,
  className = '',
  labels,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    try {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } catch {
      try {
        container.scrollTop = container.scrollHeight;
      } catch {
        /* noop */
      }
    }
  }, [messages, showTyping]);

  return (
    <div
      ref={scrollRef}
      className={`overflow-y-auto overscroll-contain p-3 space-y-3 ${className}`}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`text-sm ${m.author === 'me' ? 'text-right' : 'text-left'}`}
        >
          {labels?.[m.author] ? (
            <div className="mb-1 opacity-80 text-xs">{labels[m.author]}</div>
          ) : (
            m.address &&
            m.author === 'server' && (
              <div className="mb-0.5 opacity-80">
                <div className="inline-flex items-center gap-1">
                  <EnsAvatar
                    address={m.address}
                    alt={m.address}
                    className="h-4 w-4 shrink-0"
                    width={14}
                    height={14}
                  />
                  <AddressDisplay
                    address={m.address}
                    className="text-[10px]"
                    compact
                  />
                </div>
              </div>
            )
          )}
          <div
            className={`inline-block px-2 py-1 rounded ${m.author === 'me' ? 'bg-primary text-primary-foreground' : 'bg-muted'} ${m.error ? 'ring-1 ring-destructive/50' : ''} max-w-[80%] text-left break-words`}
          >
            <SafeMarkdown content={m.text} variant="compact" />
          </div>
          {m.error && (
            <div className="text-[10px] text-destructive mt-0.5 opacity-80">
              {m.error}
            </div>
          )}
        </div>
      ))}
      {showTyping && (
        <div className="text-sm text-left">
          <div
            className={`inline-block px-2 py-1 rounded bg-muted whitespace-pre-line max-w-[80%] text-left`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 animate-pulse [animation-delay:0ms]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 animate-pulse [animation-delay:200ms]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 animate-pulse [animation-delay:400ms]" />
            </span>
          </div>
        </div>
      )}
      {messages.length === 0 && showLoader && (
        <div className="w-full h-full flex items-center justify-center">
          <LottieLoader width={32} height={32} />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
