'use client';

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

type ChatContextValue = {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

type ChatProviderProps = {
  children: React.ReactNode;
};

export const ChatProvider = ({ children }: ChatProviderProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('sapience.chat.isOpen');
      if (stored !== null) {
        setIsOpen(stored === 'true');
      }
    } catch {
      /* noop */
    }
  }, []);

  const openChat = useCallback(() => {
    setIsOpen(true);
    try {
      window.localStorage.setItem('sapience.chat.isOpen', 'true');
    } catch {
      /* noop */
    }
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    try {
      window.localStorage.setItem('sapience.chat.isOpen', 'false');
    } catch {
      /* noop */
    }
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('sapience.chat.isOpen', String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return (
    <ChatContext.Provider value={{ isOpen, openChat, closeChat, toggleChat }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
};
