'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import LottieLoader from '~/components/shared/LottieLoader';

type Props = {
  messages: ChatMessage[];
  showLoader: boolean;
};

export function ChatMessages({ messages, showLoader }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3 space-y-2">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`text-sm ${m.author === 'me' ? 'text-right' : 'text-left'}`}
        >
          {m.address && m.author === 'server' && (
            <div className="mb-0.5 opacity-80">
              <AddressDisplay
                address={m.address}
                className="text-[10px]"
                compact
              />
            </div>
          )}
          <div
            className={`inline-block px-2 py-1 rounded ${m.author === 'me' ? 'bg-primary text-primary-foreground' : 'bg-muted'} ${m.error ? 'ring-1 ring-destructive/50' : ''} whitespace-pre-line max-w-[80%] text-left break-words`}
          >
            {m.text}
          </div>
          {m.error && (
            <div className="text-[10px] text-destructive mt-0.5 opacity-80">
              {m.error}
            </div>
          )}
        </div>
      ))}
      {messages.length === 0 && showLoader && (
        <div className="flex items-center justify-center py-8 my-8">
          <LottieLoader width={32} height={32} />
        </div>
      )}
    </div>
  );
}
