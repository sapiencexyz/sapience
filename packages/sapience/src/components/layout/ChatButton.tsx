'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useChat } from '~/lib/context/ChatContext';

type ChatButtonProps = {
  onAfterClick?: () => void;
  // When true, render an icon-only circular button (for desktop header)
  iconOnly?: boolean;
};

const ChatButton = ({ onAfterClick, iconOnly = false }: ChatButtonProps) => {
  const searchParams = useSearchParams();
  const { openChat } = useChat();
  const [chatEnabled, setChatEnabled] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const value =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('chat')
          : null;
      setChatEnabled(value === 'true');
    } catch {
      setChatEnabled(false);
    }
  }, []);

  // React to query param changes
  useEffect(() => {
    try {
      const qp = searchParams?.get('chat');
      if (qp === 'true') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('chat', 'true');
        }
        setChatEnabled(true);
      } else if (qp === 'false') {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('chat');
        }
        setChatEnabled(false);
      }
    } catch {
      /* noop */
    }
  }, [searchParams]);

  if (!chatEnabled) return null;

  if (iconOnly) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="rounded-full md:h-9 md:w-9"
        onClick={() => {
          if (onAfterClick) onAfterClick();
          openChat();
        }}
        aria-label="Open chat"
      >
        <MessageCircle />
      </Button>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex w-fit mx-3 mt-0">
        <Button
          variant="outline"
          size="xs"
          className="rounded-full px-3 justify-start gap-2"
          onClick={() => {
            if (onAfterClick) onAfterClick();
            openChat();
          }}
        >
          <MessageCircle className="h-3 w-3 scale-[0.8]" />
          <span className="relative top-[1px]">Chat</span>
        </Button>
      </div>
    </div>
  );
};

export default ChatButton;
