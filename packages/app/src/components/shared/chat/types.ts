'use client';

import { getNetworkEndpointDefaults } from '~/lib/config/networkDefaults';

type ChatAuthor = 'me' | 'server' | 'system';

export type ChatMessage = {
  id: string;
  author: ChatAuthor;
  text: string;
  address?: string;
  clientId?: string;
  timestamp?: number;
  error?: string;
};

const WEBSOCKET_PATH = '/chat';
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
  // No Settings override → follow the active network default. Robinhood ships
  // chat off (blank), so the chat bubble is hidden and this base is never used
  // to open a socket; only an explicit override (Ethereal presets) enables chat.
  return getNetworkEndpointDefaults().chatBase;
};

export const buildWebSocketUrl = () => {
  const base = getBase();
  const u = new URL(base);
  const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = u.pathname && u.pathname !== '/' ? u.pathname : WEBSOCKET_PATH;
  return `${protocol}//${u.host}${path}`;
};
