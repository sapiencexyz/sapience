'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignMessage } from 'wagmi';
import { buildWebSocketUrl } from './types';
import type { ChatMessage } from './types';

type SendQueueItem = { text: string; clientId: string };

export function useChatConnection(isOpen: boolean, addressOverride?: string) {
  const userAddress: string | undefined = addressOverride;
  const normalizedUserAddress = (userAddress || '').toLowerCase();
  const { signMessageAsync } = useSignMessage();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const setMessagesAndRef = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        messagesRef.current = next;
        return next;
      });
    },
    []
  );
  const [pendingText, setPendingText] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number | null>(null);
  const refreshIntervalRef = useRef<number | null>(null);
  const isOpenRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);
  const outgoingQueueRef = useRef<SendQueueItem[]>([]);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectPromiseRef = useRef<Promise<void> | null>(null);
  const requireAuth =
    (process.env.NEXT_PUBLIC_CHAT_REQUIRE_AUTH ?? 'true') !== 'false';

  // Authorship does not depend on chat auth; only wallet address.
  // But we suppress authorship after an explicit logout until reconnect/auth.
  const suppressAuthorshipRef = useRef<boolean>(false);
  const pendingAuthInitRef = useRef<boolean>(false);

  // Recompute authorship of existing messages based on current address and auth state
  const recomputeAuthors = useCallback(() => {
    setMessagesAndRef((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.address) {
          const shouldBeMe =
            !!normalizedUserAddress &&
            m.address.toLowerCase() === normalizedUserAddress;
          if (shouldBeMe && m.author !== 'me') {
            changed = true;
            return { ...m, author: 'me' as const };
          }
          if (!shouldBeMe && m.author === 'me') {
            changed = true;
            return { ...m, author: 'server' as const };
          }
          return m;
        }
        // Messages without an address are never authored by "me"
        if (m.author === 'me') {
          changed = true;
          return { ...m, author: 'server' as const };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, [normalizedUserAddress, setMessagesAndRef]);

  const ensureAuthToken = useCallback(async () => {
    // Ensure function remains truly async for linting consistency
    await Promise.resolve();
    // Use in-memory token during a session; optionally persist to localStorage
    if (
      tokenRef.current &&
      tokenExpiryRef.current &&
      tokenExpiryRef.current > Date.now() + 60_000
    ) {
      return tokenRef.current;
    }
    // Try to load a persisted token
    try {
      const stored = window.localStorage.getItem('sapience.chat.token');
      const storedExp = window.localStorage.getItem(
        'sapience.chat.tokenExpiresAt'
      );
      if (stored && storedExp) {
        const exp = Number(storedExp);
        if (Number.isFinite(exp) && exp > Date.now() + 60_000) {
          tokenRef.current = stored;
          tokenExpiryRef.current = exp;
          return stored;
        }
      }
    } catch {
      /* noop */
    }
    // Initiate WS auth over existing socket if connected; otherwise return null to connect without token
    return null;
  }, []);

  const connectSocket = useCallback(
    (url: string, _token: string | null) => {
      const ws = new WebSocket(url);
      socketRef.current = ws;
      // no auth token in simplified mode

      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          // Handle auth protocol
          if (data?.type === 'auth_status') {
            if (data.authenticated && typeof data.expiresAt === 'number') {
              tokenExpiryRef.current = data.expiresAt;
              try {
                window.localStorage.setItem(
                  'sapience.chat.tokenExpiresAt',
                  String(data.expiresAt)
                );
              } catch {
                /* noop */
              }
              // If we connected with a token, treat auth as active and persist it
              if (_token) {
                tokenRef.current = _token;
                try {
                  window.localStorage.setItem('sapience.chat.token', _token);
                } catch {
                  /* noop */
                }
                // ensure refresh loop is running for this token
                try {
                  if (refreshIntervalRef.current) {
                    clearInterval(refreshIntervalRef.current);
                  }
                  refreshIntervalRef.current = window.setInterval(() => {
                    try {
                      if (!requireAuth) return;
                      if (!tokenRef.current || !tokenExpiryRef.current) return;
                      const msLeft = tokenExpiryRef.current - Date.now();
                      if (msLeft <= 60_000) {
                        ws.send(
                          JSON.stringify({
                            type: 'auth_refresh',
                            token: tokenRef.current,
                          })
                        );
                      }
                    } catch {
                      /* noop */
                    }
                  }, 15_000);
                } catch {
                  /* noop */
                }
              }
              // Auth is active; clear suppression and recompute authorship
              suppressAuthorshipRef.current = false;
              recomputeAuthors();
            }
            return;
          }
          if (
            data?.type === 'auth_challenge' &&
            typeof data.message === 'string' &&
            typeof data.nonce === 'string'
          ) {
            (async () => {
              try {
                const signature = await signMessageAsync({
                  message: data.message,
                });
                ws.send(
                  JSON.stringify({
                    type: 'auth_response',
                    address: userAddress,
                    signature,
                    nonce: data.nonce,
                  })
                );
              } catch {
                /* noop */
              }
            })();
            return;
          }
          if (data?.type === 'auth_ok' && typeof data.token === 'string') {
            tokenRef.current = data.token as string;
            tokenExpiryRef.current =
              typeof data.expiresAt === 'number' ? data.expiresAt : null;
            try {
              if (tokenRef.current && tokenExpiryRef.current) {
                window.localStorage.setItem(
                  'sapience.chat.token',
                  tokenRef.current
                );
                window.localStorage.setItem(
                  'sapience.chat.tokenExpiresAt',
                  String(tokenExpiryRef.current)
                );
              }
            } catch {
              /* noop */
            }
            // start/refresh pre-expiry refresh loop
            try {
              if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
              }
              refreshIntervalRef.current = window.setInterval(() => {
                try {
                  if (!requireAuth) return;
                  if (!tokenRef.current || !tokenExpiryRef.current) return;
                  const msLeft = tokenExpiryRef.current - Date.now();
                  if (msLeft <= 60_000) {
                    ws.send(
                      JSON.stringify({
                        type: 'auth_refresh',
                        token: tokenRef.current,
                      })
                    );
                  }
                } catch {
                  /* noop */
                }
              }, 15_000);
            } catch {
              /* noop */
            }
            // Auth is active; clear suppression and recompute authorship
            suppressAuthorshipRef.current = false;
            recomputeAuthors();
            // flush any queued messages now that we're authenticated
            try {
              if (outgoingQueueRef.current.length > 0) {
                const toSend = [...outgoingQueueRef.current];
                outgoingQueueRef.current = [];
                toSend.forEach(({ text, clientId }) => {
                  try {
                    ws.send(JSON.stringify({ type: 'send', text, clientId }));
                  } catch {
                    /* noop */
                  }
                });
              }
            } catch {
              /* noop */
            }
            return;
          }
          if (data?.type === 'auth_error') {
            // Clear any stale token
            tokenRef.current = null;
            tokenExpiryRef.current = null;
            try {
              window.localStorage.removeItem('sapience.chat.token');
              window.localStorage.removeItem('sapience.chat.tokenExpiresAt');
            } catch {
              /* noop */
            }
            try {
              if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
              }
            } catch {
              /* noop */
            }
            // Recompute authorship now that auth is gone (do not force suppression here)
            recomputeAuthors();
            return;
          }
          if (data?.type === 'history' && Array.isArray(data.messages)) {
            const history = data.messages as Array<{
              text: string;
              address?: string;
              timestamp?: number;
              clientId?: string;
            }>;
            setMessagesAndRef((prev) => {
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
            // If auth is required, trigger signin flow and requeue the message, then exit without adding a system error
            if (data.text === 'auth_required') {
              try {
                if (requireAuth && ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({ type: 'auth_init', address: userAddress })
                  );
                }
                if (data.clientId) {
                  const pending = messagesRef.current.find(
                    (m) => m.clientId === data.clientId
                  );
                  if (pending?.text) {
                    outgoingQueueRef.current.push({
                      text: pending.text,
                      clientId: data.clientId,
                    });
                  }
                }
              } catch {
                /* noop */
              }
              return;
            }

            const friendly =
              data.text === 'rate_limited'
                ? 'You are sending messages too quickly. Please wait.'
                : data.text === 'empty_message'
                  ? 'Message cannot be empty.'
                  : `Error: ${data.text}`;

            if (data.clientId) {
              setMessagesAndRef((prev) => {
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
              setMessagesAndRef((prev) => [
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
            setMessagesAndRef((prev) => {
              // Reconcile by clientId regardless of address presence
              if (data.clientId) {
                const byIdIdx = prev.findIndex(
                  (m) => m.clientId === data.clientId
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

              // Determine authorship if address matches current user and not suppressed
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
          setMessagesAndRef((prev) => [
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
          if (requireAuth) {
            try {
              nextToken = await ensureAuthToken();
            } catch {
              /* noop */
            }
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

      const onError = () => {
        scheduleReconnect();
      };
      const onClose = () => {
        try {
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
          }
        } catch {
          /* noop */
        }
        scheduleReconnect();
      };

      return new Promise<() => void>((resolve) => {
        const onOpen = () => {
          ws.removeEventListener('open', onOpen);
          const detach = () => {
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('error', onError);
            ws.removeEventListener('close', onClose);
          };
          reconnectAttemptsRef.current = 0;
          if (outgoingQueueRef.current.length > 0) {
            try {
              const toSend = [...outgoingQueueRef.current];
              outgoingQueueRef.current = [];
              toSend.forEach(({ text, clientId }) => {
                try {
                  ws.send(JSON.stringify({ type: 'send', text, clientId }));
                } catch {
                  /* noop */
                }
              });
            } catch {
              /* noop */
            }
          }
          // Optionally trigger auth_init if a send initiated unauthenticated
          try {
            if (requireAuth && pendingAuthInitRef.current) {
              pendingAuthInitRef.current = false;
              ws.send(
                JSON.stringify({ type: 'auth_init', address: userAddress })
              );
            }
          } catch {
            /* noop */
          }
          // Do not auto-trigger auth_init to avoid signature prompts on open
          resolve(detach);
        };

        ws.addEventListener('open', onOpen);
        ws.addEventListener('message', onMessage);
        ws.addEventListener('error', onError);
        ws.addEventListener('close', onClose);
      });
    },
    [ensureAuthToken, normalizedUserAddress, recomputeAuthors]
  );

  useEffect(() => {
    isMountedRef.current = true;
    // No persisted flags; rely on Privy address and events
    if (!isOpen) return;

    const baseUrl = buildWebSocketUrl();
    isOpenRef.current = true;

    let detach: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        let url = baseUrl;
        let token: string | null = null;
        if (requireAuth) {
          token = await ensureAuthToken();
        }
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
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } catch {
        /* noop */
      }
      try {
        detach?.();
        socketRef.current?.close();
      } finally {
        socketRef.current = null;
      }
    };
  }, [isOpen, ensureAuthToken, connectSocket]);

  useEffect(() => {
    recomputeAuthors();
  }, [normalizedUserAddress, recomputeAuthors]);

  const canChat = useMemo(() => true, []);

  const canType = useMemo(() => true, []);

  // Clear chat auth when wallet disconnects or address changes
  const prevAddressRef = useRef<string | null>(null);
  useEffect(() => {
    const current = (userAddress || '').toLowerCase();
    const prev = prevAddressRef.current;
    if (prev === null) {
      prevAddressRef.current = current;
      // Ensure suppression reflects current address on first run
      suppressAuthorshipRef.current = current ? false : true;
      recomputeAuthors();
      return;
    }
    if (!current || current !== prev) {
      tokenRef.current = null;
      tokenExpiryRef.current = null;
      try {
        window.localStorage.removeItem('sapience.chat.token');
        window.localStorage.removeItem('sapience.chat.tokenExpiresAt');
      } catch {
        /* noop */
      }
      try {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } catch {
        /* noop */
      }
      try {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'auth_logout' }));
        }
      } catch {
        /* noop */
      }
      // If user has connected a new address, lift suppression; otherwise keep messages as not-me
      suppressAuthorshipRef.current = current ? false : true;
      prevAddressRef.current = current;
      // Recompute authorship on address change or disconnect
      recomputeAuthors();
    }
  }, [userAddress]);

  // Listen for explicit logout events (same-tab) and localStorage changes (cross-tab)
  useEffect(() => {
    const onAppLogout = () => {
      try {
        tokenRef.current = null;
        tokenExpiryRef.current = null;
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } catch {
        /* noop */
      }
      try {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'auth_logout' }));
        }
      } catch {
        /* noop */
      }
      // Suppress authorship until user reconnects or reauths
      suppressAuthorshipRef.current = true;
      // No persistence
      recomputeAuthors();
    };

    const onStorage = (e: StorageEvent) => {
      if (!e) return;
      if (e.key === 'sapience.chat.token' && !e.newValue) {
        onAppLogout();
      }
    };

    try {
      window.addEventListener(
        'sapience:chat_logout',
        onAppLogout as EventListener
      );
      window.addEventListener('storage', onStorage);
    } catch {
      /* noop */
    }
    return () => {
      try {
        window.removeEventListener(
          'sapience:chat_logout',
          onAppLogout as EventListener
        );
        window.removeEventListener('storage', onStorage);
      } catch {
        /* noop */
      }
    };
  }, [recomputeAuthors]);

  const sendMessage = useCallback(() => {
    const text = pendingText.trim();
    if (!text) return;
    // If auth is required and not ready, queue and (re)connect/auth
    setPendingText('');

    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      author: userAddress ? 'me' : 'server',
      text,
      address: userAddress,
      clientId,
      timestamp: Date.now(),
    };
    setMessagesAndRef((prev) => [...prev, optimistic]);

    const isSocketOpen = socketRef.current?.readyState === WebSocket.OPEN;
    const isAuthed = !requireAuth || !!tokenRef.current;
    if (!isSocketOpen || !isAuthed) {
      outgoingQueueRef.current.push({ text, clientId });
      // Ensure auth flow starts promptly when sending while unauthenticated
      if (requireAuth) {
        try {
          if (isSocketOpen) {
            socketRef.current?.send(
              JSON.stringify({ type: 'auth_init', address: userAddress })
            );
          } else {
            pendingAuthInitRef.current = true;
          }
        } catch {
          /* noop */
        }
      }
      if (!reconnectPromiseRef.current) {
        reconnectPromiseRef.current = (async () => {
          try {
            try {
              socketRef.current?.close();
            } catch {
              /* noop */
            }
            let url = buildWebSocketUrl();
            let token: string | null = null;
            if (requireAuth) {
              try {
                token = await ensureAuthToken();
              } catch {
                /* noop */
              }
            }
            if (token) {
              url = `${url}?token=${encodeURIComponent(token)}`;
            }
            await connectSocket(url, token || null);
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
      socketRef.current?.send(JSON.stringify({ type: 'send', text, clientId }));
    } catch {
      outgoingQueueRef.current.push({ text, clientId });
    }
  }, [
    pendingText,
    canChat,
    userAddress,
    connectSocket,
    ensureAuthToken,
    requireAuth,
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
          if (!requireAuth) return;
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: 'auth_init', address: userAddress })
            );
          } else {
            pendingAuthInitRef.current = true;
          }
        } catch {
          /* noop */
        }
      },
    },
  } as const;
}
