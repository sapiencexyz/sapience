'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/ui/components/ui/button';
import { Card } from '@sapience/ui/components/ui/card';
import { Input } from '@sapience/ui/components/ui/input';
import { X, MessageCircle } from 'lucide-react';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { useChat } from '~/lib/context/ChatContext';

type ChatMessage = {
  id: string;
  author: 'me' | 'server' | 'system';
  text: string;
  address?: string;
};

const WEBSOCKET_PATH = '/chat';
const API_BASE = process.env.NEXT_PUBLIC_FOIL_API_URL as string;

const buildWebSocketUrl = () => {
  const u = new URL(API_BASE);
  const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${u.host}${WEBSOCKET_PATH}`;
};

const ChatWidget = () => {
  const { isOpen, closeChat } = useChat();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingText, setPendingText] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  const socketTokenRef = useRef<string | null>(null);

  const userAddress = connectedWallet?.address || '';
  const normalizedUserAddress = userAddress.toLowerCase();

  const connectSocket = useCallback(
    (url: string, token: string | null) => {
      const ws = new WebSocket(url);
      socketRef.current = ws;
      socketTokenRef.current = token;

      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'history' && Array.isArray(data.messages)) {
            const history = data.messages as Array<{
              text: string;
              address?: string;
              timestamp?: number;
            }>;
            setMessages((prev) => {
              if (prev.length > 0) return prev; // don't override if user already typing
              return history.map((m) => ({
                id: crypto.randomUUID(),
                author:
                  m.address && m.address.toLowerCase() === normalizedUserAddress
                    ? 'me'
                    : 'server',
                text: m.text,
                address: m.address,
              }));
            });
            return;
          }
          if (data?.type === 'error' && data.text === 'auth_required') {
            // Suppress showing raw error; user will be prompted on next send
            return;
          }
          if (typeof data.text === 'string') {
            if (
              data.address &&
              data.address.toLowerCase() === normalizedUserAddress
            )
              return;
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                author: 'server',
                text: data.text,
                address: data.address,
              },
            ]);
          }
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              author: 'server',
              text: String(event.data),
            },
          ]);
        }
      };
      const onError = () => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const text = 'Connection error.';
          if (last && last.text === text) return prev;
          return [...prev, { id: crypto.randomUUID(), author: 'system', text }];
        });
      };
      const onClose = () => {
        void 0;
      };

      return new Promise<() => void>((resolve) => {
        const onOpen = () => {
          ws.removeEventListener('open', onOpen);
          const detach = () => {
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('error', onError);
            ws.removeEventListener('close', onClose);
          };
          resolve(detach);
        };

        ws.addEventListener('open', onOpen);
        ws.addEventListener('message', onMessage);
        ws.addEventListener('error', onError);
        ws.addEventListener('close', onClose);
      });
    },
    [userAddress]
  );

  useEffect(() => {
    if (!isOpen) return;

    const baseUrl = buildWebSocketUrl();

    let detach: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const d = await connectSocket(baseUrl, null);
        if (!cancelled) detach = d;
      } catch {
        /* noop */
      }
    })();

    return () => {
      cancelled = true;
      try {
        detach?.();
        socketRef.current?.close();
      } finally {
        socketRef.current = null;
        socketTokenRef.current = null;
      }
    };
  }, [isOpen, userAddress, connectSocket]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // When wallet becomes known, reclassify history messages authored by me
  useEffect(() => {
    if (!normalizedUserAddress) return;
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (
          m.author !== 'me' &&
          m.address &&
          m.address.toLowerCase() === normalizedUserAddress
        ) {
          changed = true;
          return { ...m, author: 'me' as const };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, [normalizedUserAddress]);

  const canChat = useMemo(
    () => ready && authenticated && !!userAddress,
    [ready, authenticated, userAddress]
  );

  const ensureAuthToken = async (): Promise<string | null> => {
    try {
      if (!userAddress) return null;
      // Return cached token if present and not expired
      if (tokenRef.current) return tokenRef.current;
      const storedRaw =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('chatToken')
          : null;
      if (storedRaw) {
        try {
          const stored = JSON.parse(storedRaw) as {
            token: string;
            expiresAt: number;
            address: string;
          };
          if (
            stored.address?.toLowerCase() === userAddress.toLowerCase() &&
            stored.expiresAt > Date.now()
          ) {
            tokenRef.current = stored.token;
            return stored.token;
          }
        } catch {
          /* noop */
        }
      }

      // Fetch nonce & message
      const resNonce = await fetch(`${API_BASE}/chat-auth/nonce`);
      const { message } = await resNonce.json();

      // Sign via Privy wallet
      const wallet = connectedWallet;
      if (!wallet) return null;
      const signature = await wallet.sign(message);

      // Verify
      const resVerify = await fetch(`${API_BASE}/chat-auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: userAddress,
          signature,
          nonce: (message.match(/Nonce: (.+)/)?.[1] || '').trim(),
        }),
      });
      if (!resVerify.ok) return null;
      const { token, expiresAt } = await resVerify.json();
      tokenRef.current = token;
      try {
        window.localStorage.setItem(
          'chatToken',
          JSON.stringify({ token, expiresAt, address: userAddress })
        );
      } catch {
        /* noop */
      }
      return token;
    } catch {
      return null;
    }
  };

  const sendMessage = async () => {
    if (!pendingText.trim()) return;
    if (!canChat) return;
    // Build base URL
    let url = buildWebSocketUrl();

    // Ensure authenticated connection before sending
    let needReconnect = false;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      needReconnect = true;
    } else if (!socketTokenRef.current) {
      // Socket is open but unauthenticated
      needReconnect = true;
    }

    if (needReconnect) {
      const token = await ensureAuthToken();
      if (token) url = `${url}?token=${encodeURIComponent(token)}`;
      try {
        // Close existing socket if any
        try {
          socketRef.current?.close();
        } catch {
          void 0;
        }
        // Connect with handlers and wait for open (single socket)
        await connectSocket(url, token || null);
      } catch {
        /* noop */
      }
    }

    const text = pendingText.trim();
    setPendingText('');
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), author: 'me', text },
    ]);
    try {
      socketRef.current?.send(JSON.stringify({ text }));
    } catch {
      void 0;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <Card className="w-80 shadow-xl border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 opacity-80" />
            <span className="text-sm font-medium">Chat</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={closeChat}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3 space-y-2">
          {!ready || !authenticated ? (
            <div className="text-xs text-muted-foreground">
              Log in to use chat.
            </div>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm ${m.author === 'me' ? 'text-right' : 'text-left'}`}
            >
              {m.address && m.author === 'server' && (
                <div className="mb-0.5 opacity-80">
                  <AddressDisplay
                    address={m.address}
                    disableProfileLink
                    className="text-[10px]"
                    compact
                  />
                </div>
              )}
              <span
                className={`inline-block px-2 py-1 rounded ${m.author === 'me' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                {m.text}
              </span>
            </div>
          ))}
          {messages.length === 0 && ready && authenticated && (
            <div className="text-xs text-muted-foreground">👋</div>
          )}
        </div>
        <div className="p-3 border-t flex items-center gap-2">
          <Input
            value={pendingText}
            onChange={(e) => setPendingText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendMessage();
            }}
            placeholder={canChat ? 'Type a message…' : 'Connect to chat'}
            disabled={!canChat}
          />
          <Button
            onClick={() => void sendMessage()}
            disabled={!canChat || !pendingText.trim()}
          >
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ChatWidget;
