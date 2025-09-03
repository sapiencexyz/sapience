'use client';

export type ChatAuthor = 'me' | 'server' | 'system';

export type ChatMessage = {
  id: string;
  author: ChatAuthor;
  text: string;
  address?: string;
  clientId?: string;
  timestamp?: number;
  error?: string;
};

export const WEBSOCKET_PATH = '/chat';
const getBase = (): string => {
  try {
    if (typeof window !== 'undefined') {
      const override = window.localStorage.getItem(
        'sapience.settings.chatBaseUrl'
      );
      if (override) return override;
    }
  } catch {
    /* noop */
  }
  const env =
    (process.env.NEXT_PUBLIC_FOIL_API_URL as string) ||
    'https://api.sapience.xyz';
  try {
    const u = new URL(env);
    return `${u.origin}${WEBSOCKET_PATH}`;
  } catch {
    return `https://api.sapience.xyz${WEBSOCKET_PATH}`;
  }
};

export const API_BASE = getBase();

export const buildWebSocketUrl = () => {
  const base = getBase();
  const u = new URL(base);
  const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = u.pathname && u.pathname !== '/' ? u.pathname : WEBSOCKET_PATH;
  return `${protocol}//${u.host}${path}`;
};
