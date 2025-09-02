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
export const API_BASE = process.env.NEXT_PUBLIC_FOIL_API_URL as string;

export const buildWebSocketUrl = () => {
  const u = new URL(API_BASE);
  const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${u.host}${WEBSOCKET_PATH}`;
};
