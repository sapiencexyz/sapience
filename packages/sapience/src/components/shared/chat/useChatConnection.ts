'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { buildWebSocketUrl } from './types';
import type { ChatMessage } from './types';

type SendQueueItem = { text: string; clientId: string };

export function useChatConnection(isOpen: boolean) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];
  const userAddress = connectedWallet?.address || '';
  const normalizedUserAddress = userAddress.toLowerCase();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingText, setPendingText] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const socketTokenRef = useRef<string | null>(null);
  const isOpenRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);
  const outgoingQueueRef = useRef<SendQueueItem[]>([]);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectPromiseRef = useRef<Promise<void> | null>(null);

  const ensureAuthToken = useCallback(
    async (force?: boolean): Promise<string | null> => {
      try {
        if (!userAddress) return null;
        if (!force && tokenRef.current) return tokenRef.current;
        const storedRaw =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('chatToken')
            : null;
        if (!force && storedRaw) {
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

        const base =
          (typeof window !== 'undefined' &&
            window.localStorage.getItem('sapience.settings.chatBaseUrl')) ||
          (process.env.NEXT_PUBLIC_FOIL_API_URL as string);
        // Build chat auth endpoints from chat base path
        const authBase = (() => {
          try {
            const u = new URL(base);
            // If base already includes a path (e.g., https://api.sapience.xyz/chat), append /auth under that path
            const path =
              u.pathname && u.pathname !== '/' ? u.pathname : '/chat';
            return `${u.origin}${path}/auth`;
          } catch {
            // If base is just an origin, default to /chat/auth
            try {
              const u2 = new URL(`${base}`);
              const path =
                u2.pathname && u2.pathname !== '/' ? u2.pathname : '/chat';
              return `${u2.origin}${path}/auth`;
            } catch {
              return `${base}/chat/auth`;
            }
          }
        })();
        const resNonce = await fetch(`${authBase}/nonce`);
        const { message } = await resNonce.json();
        const wallet = connectedWallet;
        if (!wallet) return null;
        const signature = await wallet.sign(message);
        const resVerify = await fetch(`${authBase}/verify`, {
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
    },
    [connectedWallet, userAddress]
  );

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
              clientId?: string;
            }>;
            setMessages((prev) => {
              if (prev.length > 0) return prev;
              return history.map((m) => ({
                id: crypto.randomUUID(),
                author:
                  m.address && m.address.toLowerCase() === normalizedUserAddress
                    ? 'me'
                    : 'server',
                text: m.text,
                address: m.address,
                timestamp: m.timestamp,
                clientId: m.clientId,
              }));
            });
            return;
          }
          if (data?.type === 'error' && typeof data.text === 'string') {
            const friendly =
              data.text === 'rate_limited'
                ? 'You are sending messages too quickly. Please wait.'
                : data.text === 'empty_message'
                  ? 'Message cannot be empty.'
                  : data.text === 'auth_required'
                    ? 'Please log in to send messages.'
                    : `Error: ${data.text}`;

            if (data.clientId) {
              setMessages((prev) => {
                const idx = prev.findIndex(
                  (m) => m.author === 'me' && m.clientId === data.clientId
                );
                if (idx === -1) {
                  return [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      author: 'system',
                      text: friendly,
                    },
                  ];
                }
                const next = [...prev];
                next[idx] = { ...next[idx], error: friendly };
                return next;
              });
            } else {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), author: 'system', text: friendly },
              ]);
            }
            return;
          }
          if (
            typeof data.text === 'string' &&
            (!data.type || data.type === 'message')
          ) {
            setMessages((prev) => {
              // Reconcile by clientId regardless of address presence
              if (data.clientId) {
                const byIdIdx = prev.findIndex(
                  (m) => m.author === 'me' && m.clientId === data.clientId
                );
                if (byIdIdx !== -1) {
                  const next = [...prev];
                  next[byIdIdx] = {
                    ...next[byIdIdx],
                    timestamp: data.timestamp ?? next[byIdIdx].timestamp,
                  };
                  return next;
                }
              }

              // Determine authorship if address matches current user
              const isMe =
                !!data.address &&
                data.address.toLowerCase() === normalizedUserAddress;

              // Append as a new message
              return [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  author: isMe ? 'me' : 'server',
                  text: data.text,
                  address: data.address,
                  clientId: data.clientId,
                  timestamp: data.timestamp,
                },
              ];
            });
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

      const scheduleReconnect = () => {
        if (reconnectPromiseRef.current) return;
        reconnectPromiseRef.current = (async () => {
          const attempt = reconnectAttemptsRef.current;
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((r) => setTimeout(r, delay));
          reconnectAttemptsRef.current = Math.min(attempt + 1, 10);
          if (!isMountedRef.current || !isOpenRef.current) return;
          let nextUrl = buildWebSocketUrl();
          let nextToken: string | null = null;
          try {
            nextToken = await ensureAuthToken();
          } catch {
            /* noop */
          }
          if (nextToken)
            nextUrl = `${nextUrl}?token=${encodeURIComponent(nextToken)}`;
          try {
            try {
              if (
                socketRef.current &&
                socketRef.current.readyState === WebSocket.OPEN
              ) {
                socketRef.current.close();
              }
            } catch {
              /* noop */
            }
            await connectSocket(nextUrl, nextToken);
          } catch {
            /* noop */
          }
        })().finally(() => {
          reconnectPromiseRef.current = null;
        });
      };

      const onError = () => scheduleReconnect();
      const onClose = () => scheduleReconnect();

      return new Promise<() => void>((resolve) => {
        const onOpen = () => {
          ws.removeEventListener('open', onOpen);
          const detach = () => {
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('error', onError);
            ws.removeEventListener('close', onClose);
          };
          reconnectAttemptsRef.current = 0;
          if (socketTokenRef.current && outgoingQueueRef.current.length > 0) {
            try {
              const toSend = [...outgoingQueueRef.current];
              outgoingQueueRef.current = [];
              toSend.forEach(({ text, clientId }) => {
                try {
                  ws.send(JSON.stringify({ text, clientId }));
                } catch {
                  /* noop */
                }
              });
            } catch {
              /* noop */
            }
          }
          resolve(detach);
        };

        ws.addEventListener('open', onOpen);
        ws.addEventListener('message', onMessage);
        ws.addEventListener('error', onError);
        ws.addEventListener('close', onClose);
      });
    },
    [ensureAuthToken, normalizedUserAddress]
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!isOpen) return;

    const baseUrl = buildWebSocketUrl();
    isOpenRef.current = true;

    let detach: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        let url = baseUrl;
        const token = await ensureAuthToken();
        if (token) url = `${baseUrl}?token=${encodeURIComponent(token)}`;
        const d = await connectSocket(url, token || null);
        if (!cancelled) detach = d;
      } catch {
        /* noop */
      }
    })();

    return () => {
      cancelled = true;
      isOpenRef.current = false;
      isMountedRef.current = false;
      try {
        detach?.();
        socketRef.current?.close();
      } finally {
        socketRef.current = null;
        socketTokenRef.current = null;
      }
    };
  }, [isOpen, ensureAuthToken, connectSocket]);

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

  const canType = useMemo(() => ready, [ready]);

  const sendMessage = useCallback(() => {
    const text = pendingText.trim();
    if (!text) return;
    if (!canChat) {
      // If not authenticated, try to login first
      try {
        login();
      } catch {
        /* noop */
      }
      return;
    }
    setPendingText('');

    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      author: 'me',
      text,
      address: userAddress,
      clientId,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const isSocketOpen = socketRef.current?.readyState === WebSocket.OPEN;
    const isAuthed = !!socketTokenRef.current;
    if (!isSocketOpen || !isAuthed) {
      outgoingQueueRef.current.push({ text, clientId });
      let url = buildWebSocketUrl();
      if (!reconnectPromiseRef.current) {
        reconnectPromiseRef.current = (async () => {
          let token = await ensureAuthToken();
          if (!token) {
            try {
              login();
            } catch {
              /* noop */
            }
            token = await ensureAuthToken(true);
            if (!token) return;
          }
          url = `${url}?token=${encodeURIComponent(token)}`;
          try {
            try {
              socketRef.current?.close();
            } catch {
              /* noop */
            }
            await connectSocket(url, token);
          } catch {
            /* noop */
          }
        })().finally(() => {
          reconnectPromiseRef.current = null;
        });
      }
      return;
    }

    try {
      socketRef.current?.send(JSON.stringify({ text, clientId }));
    } catch {
      outgoingQueueRef.current.push({ text, clientId });
    }
  }, [
    pendingText,
    canChat,
    userAddress,
    ensureAuthToken,
    connectSocket,
    login,
  ]);

  return {
    state: {
      messages,
      pendingText,
      setPendingText,
      canChat,
      canType,
      userAddress,
    },
    actions: {
      sendMessage,
      loginNow: () => {
        try {
          login();
        } catch {
          /* noop */
        }
      },
    },
  } as const;
}
