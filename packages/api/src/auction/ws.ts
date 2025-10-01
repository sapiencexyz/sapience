import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import { verifyMessage, type Abi } from 'viem';
import { getProviderForChain } from '../utils/utils';
import { addBid, getBids, upsertAuction, getAuction } from './registry';
import { basicValidateBid } from './sim';
import { verifyTakerBidStrict } from './helpers';
import {
  PREDICTION_MARKET_ADDRESS_ARB1,
  PREDICTION_MARKET_CHAIN_ID_ARB1,
} from '../constants';
import Sentry from '../instrument';
import type {
  BotToServerMessage,
  ClientToServerMessage,
  ServerToClientMessage,
  AuctionRequestPayload,
  BidPayload,
} from './types';

function isClientMessage(msg: unknown): msg is ClientToServerMessage {
  if (!msg || typeof msg !== 'object' || msg === null || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return (
    typeof msgObj.type === 'string' &&
    (msgObj.type === 'auction.start' || msgObj.type === 'auction.subscribe')
  );
}

function isBotMessage(msg: unknown): msg is BotToServerMessage {
  if (!msg || typeof msg !== 'object' || msg === null || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return msgObj.type === 'bid.submit';
}

function safeParse<T = unknown>(data: RawData): T | null {
  try {
    return JSON.parse(String(data)) as T;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, message: ServerToClientMessage) {
  ws.send(JSON.stringify(message));
}

function subscribeToAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  if (!auctionSubscriptions.has(auctionId)) {
    auctionSubscriptions.set(auctionId, new Set());
  }
  auctionSubscriptions.get(auctionId)!.add(ws);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function unsubscribeFromAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      auctionSubscriptions.delete(auctionId);
    }
  }
}

function unsubscribeFromAllAuctions(
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  for (const [auctionId, subscribers] of auctionSubscriptions.entries()) {
    if (subscribers.has(ws)) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        auctionSubscriptions.delete(auctionId);
      }
    }
  }
}

function broadcastToAuctionSubscribers(
  auctionId: string,
  message: ServerToClientMessage,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (!subscribers || subscribers.size === 0) {
    return 0;
  }

  const dataStr = JSON.stringify(message);
  let recipients = 0;
  subscribers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(dataStr);
        recipients++;
      } catch (error) {
        console.warn(`[Auction-WS] Failed to send to subscriber:`, error);
        subscribers.delete(ws);
      }
    } else {
      subscribers.delete(ws);
    }
  });

  return recipients;
}

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 100;

export function createAuctionWebSocketServer() {
  const wss = new WebSocketServer({ noServer: true });

  // Track which clients are subscribed to which auction channels
  const auctionSubscriptions = new Map<string, Set<WebSocket>>();

  // Vault quotes multiplexed on /auction
  type VaultKey = string; // `${chainId}:${vaultAddressLower}`
  type PublishVaultQuotePayload = {
    chainId: number;
    vaultAddress: string;
    vaultCollateralPerShare: string; // decimal string, e.g. "1.234567"
    timestamp: number;
    signedBy: string;
    signature: string;
  };
  type SubscribePayload = { chainId: number; vaultAddress: string };
  type VaultServerToClientMessage =
    | { type: 'vault_quote.update'; payload: PublishVaultQuotePayload }
    | { type: 'vault_quote.ack'; payload: { ok?: boolean; error?: string } };

  const vaultSubscriptions = new Map<VaultKey, Set<WebSocket>>();
  const latestVaultQuoteByKey = new Map<VaultKey, PublishVaultQuotePayload>();
  const vaultSignerCache = new Map<
    VaultKey,
    { signers: Set<string>; fetchedAt: number }
  >();
  const vaultObservers = new Set<WebSocket>();

  function makeVaultKey(chainId: number, vaultAddress: string): VaultKey {
    return `${chainId}:${vaultAddress.toLowerCase()}`;
  }
  function broadcastToVaultSubscribers(
    key: VaultKey,
    message: VaultServerToClientMessage
  ): number {
    const set = vaultSubscriptions.get(key);
    if (!set || set.size === 0) return 0;
    const str = JSON.stringify(message);
    let n = 0;
    set.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(str);
          n++;
        } catch {
          set.delete(ws);
        }
      } else {
        set.delete(ws);
      }
    });
    return n;
  }
  function vaultSubscribe(key: VaultKey, ws: WebSocket) {
    if (!vaultSubscriptions.has(key)) vaultSubscriptions.set(key, new Set());
    vaultSubscriptions.get(key)!.add(ws);
  }
  function vaultUnsubscribe(key: VaultKey, ws: WebSocket) {
    const set = vaultSubscriptions.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) vaultSubscriptions.delete(key);
  }
  function vaultUnsubscribeAll(ws: WebSocket) {
    for (const [k, set] of vaultSubscriptions.entries()) {
      if (set.has(ws)) {
        set.delete(ws);
        if (set.size === 0) vaultSubscriptions.delete(k);
      }
    }
  }

  function addVaultObserver(ws: WebSocket) {
    vaultObservers.add(ws);
  }
  function removeVaultObserver(ws: WebSocket) {
    vaultObservers.delete(ws);
  }
  function broadcastToVaultObservers(message: unknown): number {
    if (vaultObservers.size === 0) return 0;
    const str = (() => {
      try {
        return JSON.stringify(message);
      } catch {
        return '';
      }
    })();
    if (!str) return 0;
    let count = 0;
    vaultObservers.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(str);
          count++;
        } catch {
          vaultObservers.delete(client);
        }
      } else {
        vaultObservers.delete(client);
      }
    });
    return count;
  }

  const PASSIVE_VAULT_ABI: Abi = [
    {
      type: 'function',
      name: 'manager',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
    {
      type: 'function',
      name: 'owner',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
  ];
  async function fetchAuthorizedVaultSigners(
    chainId: number,
    vaultAddress: string
  ): Promise<Set<string>> {
    const client = getProviderForChain(chainId);
    const addr = vaultAddress.toLowerCase() as `0x${string}`;
    const manager = (await client
      .readContract({
        address: addr,
        abi: PASSIVE_VAULT_ABI,
        functionName: 'manager',
      })
      .catch(() => undefined)) as string | undefined;
    const set = new Set<string>();
    if (manager) set.add(manager.toLowerCase());
    return set;
  }
  function buildVaultCanonicalMessage(
    payload: PublishVaultQuotePayload
  ): string {
    return [
      'Sapience Vault Share Quote',
      `Vault: ${payload.vaultAddress.toLowerCase()}`,
      `ChainId: ${payload.chainId}`,
      `CollateralPerShare: ${String(payload.vaultCollateralPerShare)}`,
      `Timestamp: ${payload.timestamp}`,
    ].join('\n');
  }

  // Startup banner removed to reduce verbosity

  wss.on('connection', (ws, req: IncomingMessage) => {
    const ip =
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      'unknown';

    let rateCount = 0;
    let rateResetAt = Date.now() + RATE_LIMIT_WINDOW_MS;

    ws.on('message', async (data: RawData) => {
      // basic rate limiting and size guard
      const now = Date.now();
      if (now > rateResetAt) {
        rateCount = 0;
        rateResetAt = now + RATE_LIMIT_WINDOW_MS;
      }
      if (++rateCount > RATE_LIMIT_MAX_MESSAGES) {
        console.warn(
          `[Auction-WS] Rate limit exceeded from ${ip}; closing connection`
        );
        try {
          ws.close(1008, 'rate_limited');
        } catch (err) {
          console.error(
            '[Auction-WS] Failed to close rate-limited connection:',
            err
          );
        }
        return;
      }
      const dataSize =
        typeof data === 'string'
          ? (data as string).length
          : (data as Buffer).byteLength;
      if (dataSize > 64_000) {
        console.warn(
          `[Auction-WS] Message too large from ${ip}; closing connection`
        );
        try {
          ws.close(1009, 'message_too_large');
        } catch (err) {
          console.error(
            '[Auction-WS] Failed to close oversized-message connection:',
            err
          );
        }
        return;
      }
      const msg = safeParse<
        ClientToServerMessage | BotToServerMessage | { type?: string }
      >(data);
      if (!msg || typeof msg !== 'object') {
        console.warn(`[Auction-WS] Invalid JSON from ${ip}`);
        return;
      }

      // Handle Vault Quote messages (multiplexed)
      if ((msg as { type?: string })?.type?.startsWith('vault_quote.')) {
        const type = (msg as { type?: string }).type as string;
        if (type === 'vault_quote.observe') {
          addVaultObserver(ws);
          try {
            ws.send(
              JSON.stringify({ type: 'vault_quote.ack', payload: { ok: true } })
            );
          } catch (err) {
            console.error(
              '[Auction-WS] Failed to send vault_quote.ack (observe):',
              err
            );
          }
          return;
        }
        if (type === 'vault_quote.unobserve') {
          removeVaultObserver(ws);
          try {
            ws.send(
              JSON.stringify({ type: 'vault_quote.ack', payload: { ok: true } })
            );
          } catch (err) {
            console.error(
              '[Auction-WS] Failed to send vault_quote.ack (unobserve):',
              err
            );
          }
          return;
        }
        if (type === 'vault_quote.subscribe') {
          const { chainId, vaultAddress } =
            (msg as unknown as { payload?: SubscribePayload })?.payload ||
            ({} as SubscribePayload);
          if (!chainId || !vaultAddress) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'vault_quote.ack',
                  payload: { error: 'invalid_subscribe' },
                })
              );
            } catch (err) {
              console.error(
                '[Auction-WS] Failed to send vault_quote.ack (invalid_subscribe):',
                err
              );
            }
            return;
          }
          const key = makeVaultKey(chainId, vaultAddress);
          vaultSubscribe(key, ws);
          const latest = latestVaultQuoteByKey.get(key);
          if (latest) {
            try {
              ws.send(
                JSON.stringify({ type: 'vault_quote.update', payload: latest })
              );
            } catch (err) {
              console.error(
                '[Auction-WS] Failed to send vault_quote.update (latest on subscribe):',
                err
              );
            }
          }
          try {
            ws.send(
              JSON.stringify({ type: 'vault_quote.ack', payload: { ok: true } })
            );
          } catch (err) {
            console.error(
              '[Auction-WS] Failed to send vault_quote.ack (subscribe):',
              err
            );
          }
          // Public broadcast so relayer feeds can display the request
          try {
            broadcastToVaultObservers({
              type: 'vault_quote.requested',
              payload: {
                chainId,
                vaultAddress: vaultAddress.toLowerCase(),
                channel: key,
              },
            });
          } catch (err) {
            console.error(
              '[Auction-WS] Failed to broadcast to vault observers (requested):',
              err
            );
          }
          return;
        }
        if (type === 'vault_quote.unsubscribe') {
          const { chainId, vaultAddress } =
            (msg as unknown as { payload?: SubscribePayload })?.payload ||
            ({} as SubscribePayload);
          if (!chainId || !vaultAddress) return;
          const key = makeVaultKey(chainId, vaultAddress);
          vaultUnsubscribe(key, ws);
          try {
            ws.send(
              JSON.stringify({ type: 'vault_quote.ack', payload: { ok: true } })
            );
          } catch (err) {
            console.error(
              '[Auction-WS] Failed to send vault_quote.ack (unsubscribe):',
              err
            );
          }
          return;
        }
        if (type === 'vault_quote.publish' || type === 'vault_quote.submit') {
          const p = (msg as unknown as { payload: PublishVaultQuotePayload })
            .payload;
          try {
            if (
              !p ||
              !p.vaultAddress ||
              !p.chainId ||
              p.timestamp == null ||
              p.vaultCollateralPerShare == null ||
              !p.signedBy ||
              !p.signature
            ) {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'vault_quote.ack',
                    payload: { error: 'invalid_payload' },
                  })
                );
              } catch (err) {
                console.error(
                  '[Auction-WS] Failed to send vault_quote.ack (invalid_payload):',
                  err
                );
              }
              return;
            }
            // anti-replay window (5 minutes)
            if (Math.abs(Date.now() - p.timestamp) > 5 * 60 * 1000) {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'vault_quote.ack',
                    payload: { error: 'stale_timestamp' },
                  })
                );
              } catch (err) {
                console.error(
                  '[Auction-WS] Failed to send vault_quote.ack (stale_timestamp):',
                  err
                );
              }
              return;
            }
            const key = makeVaultKey(p.chainId, p.vaultAddress);
            let allowed = vaultSignerCache.get(key);
            const cacheFresh =
              allowed && Date.now() - allowed.fetchedAt < 60_000;
            if (!cacheFresh) {
              const signers = await fetchAuthorizedVaultSigners(
                p.chainId,
                p.vaultAddress
              );
              allowed = { signers, fetchedAt: Date.now() };
              vaultSignerCache.set(key, allowed);
            }
            const canonical = buildVaultCanonicalMessage(p);
            const ok = await verifyMessage({
              address: p.signedBy.toLowerCase() as `0x${string}`,
              message: canonical,
              signature: p.signature as `0x${string}`,
            });
            if (!ok) {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'vault_quote.ack',
                    payload: { error: 'bad_signature' },
                  })
                );
              } catch (err) {
                console.error(
                  '[Auction-WS] Failed to send vault_quote.ack (bad_signature):',
                  err
                );
              }
              return;
            }
            if (!allowed!.signers.has(p.signedBy.toLowerCase())) {
              try {
                ws.send(
                  JSON.stringify({
                    type: 'vault_quote.ack',
                    payload: { error: 'unauthorized_signer' },
                  })
                );
              } catch (err) {
                console.error(
                  '[Auction-WS] Failed to send vault_quote.ack (unauthorized_signer):',
                  err
                );
              }
              return;
            }
            const normalized: PublishVaultQuotePayload = {
              chainId: p.chainId,
              vaultAddress: p.vaultAddress.toLowerCase(),
              vaultCollateralPerShare: String(p.vaultCollateralPerShare),
              timestamp: p.timestamp,
              signedBy: p.signedBy.toLowerCase(),
              signature: p.signature,
            };
            latestVaultQuoteByKey.set(key, normalized);
            broadcastToVaultSubscribers(key, {
              type: 'vault_quote.update',
              payload: normalized,
            });
            try {
              ws.send(
                JSON.stringify({
                  type: 'vault_quote.ack',
                  payload: { ok: true },
                })
              );
            } catch (err) {
              console.error(
                '[Auction-WS] Failed to send vault_quote.ack (ok after publish):',
                err
              );
            }
            // Also emit a public broadcast of the update so passive feeds can display it
            try {
              broadcastToVaultObservers({
                type: 'vault_quote.update',
                payload: normalized,
              });
            } catch (err) {
              console.error(
                '[Auction-WS] Failed to broadcast to vault observers (update):',
                err
              );
            }
          } catch (err) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'vault_quote.ack',
                  payload: {
                    error: (err as Error).message || 'internal_error',
                  },
                })
              );
            } catch (err2) {
              console.error(
                '[Auction-WS] Failed to send vault_quote.ack (internal_error):',
                err2
              );
            }
          }
          return;
        }
      }

      // Handle Auction client messages
      if (isClientMessage(msg)) {
        if (msg.type === 'auction.start') {
          const payload = msg.payload as AuctionRequestPayload;
          const auctionId = upsertAuction(payload);
          // Subscribe this client to the auction channel
          subscribeToAuction(auctionId, ws, auctionSubscriptions);

          send(ws, {
            type: 'auction.ack',
            payload: { auctionId },
          });

          // Broadcast the auction.started to bots/listeners (all clients for now)
          const requested = JSON.stringify({
            type: 'auction.started',
            payload: { ...payload, auctionId },
          });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(requested);
          });

          // Immediately stream current bids for this auction if any
          const bids = getBids(auctionId);
          if (bids.length > 0) {
            send(ws, {
              type: 'auction.bids',
              payload: { auctionId, bids },
            });
          }
          return;
        }
        if (msg.type === 'auction.subscribe') {
          const auctionId = (msg.payload as { auctionId?: string })?.auctionId;
          if (typeof auctionId === 'string' && auctionId.length > 0) {
            subscribeToAuction(auctionId, ws, auctionSubscriptions);
            // Immediately stream current bids if any
            const bids = getBids(auctionId);
            if (bids.length > 0) {
              send(ws, {
                type: 'auction.bids',
                payload: { auctionId, bids },
              });
            }
          } else {
            console.warn('[Auction-WS] subscribe rejected: missing auctionId');
          }
          return;
        }
      }

      // Handle bot bid messages
      if (isBotMessage(msg)) {
        const bid = msg.payload as BidPayload;
        const rec = getAuction(bid.auctionId);
        if (!rec) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'auction_not_found_or_expired' },
          });
          console.warn(
            `[Auction-WS] bid.submit rejected auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
          );
          return;
        }
        const sim = basicValidateBid(rec.auction, bid);
        if (!sim.ok) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: sim.reason || 'invalid_bid' },
          });
          console.warn(
            `[Auction-WS] bid.submit rejected auctionId=${bid.auctionId} reason=${sim.reason || 'invalid_bid'}`
          );
          return;
        }
        // Optional strict EIP-712 verification when address is configured
        (async () => {
          try {
            const strict = await verifyTakerBidStrict({
              auction: rec.auction,
              bid,
              chainId: PREDICTION_MARKET_CHAIN_ID_ARB1,
              verifyingContract: PREDICTION_MARKET_ADDRESS_ARB1,
            });
            if (!strict.ok) {
              console.warn(
                `[Auction-WS] bid.submit strict verification failed auctionId=${bid.auctionId} reason=${strict.reason}`
              );
            }
          } catch (err) {
            console.warn(
              '[Auction-WS] Strict verification threw; continuing:',
              err
            );
          }
        })().catch(() => undefined);
        const validated = addBid(bid.auctionId, bid);
        if (!validated) {
          send(ws, {
            type: 'bid.ack',
            payload: { error: 'auction_not_found_or_expired' },
          });
          console.warn(
            `[Auction-WS] bid.submit failed auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
          );
          return;
        }
        send(ws, { type: 'bid.ack', payload: {} });

        // Broadcast updated top bids only to auction subscribers
        const payload: ServerToClientMessage = {
          type: 'auction.bids',
          payload: { auctionId: bid.auctionId, bids: getBids(bid.auctionId) },
        };
        broadcastToAuctionSubscribers(
          bid.auctionId,
          payload,
          auctionSubscriptions
        );
        return;
      }

      console.warn(
        `[Auction-WS] Unhandled message type from ${ip}: ${
          (msg as Record<string, unknown>)?.type ?? typeof msg
        }`
      );
    });

    ws.on('error', (err) => {
      console.error(`[Auction-WS] Socket error from ${ip}:`, err);
      try {
        Sentry.captureException(err);
      } catch (err2) {
        console.error('[Auction-WS] Sentry capture failed:', err2);
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = (() => {
        try {
          return reason ? reason.toString() : '';
        } catch {
          return '';
        }
      })();

      console.log(
        `[Auction-WS] Socket closed from ${ip} code=${code} reason=${reasonStr}`
      );

      // Clean up auction subscriptions for this client
      unsubscribeFromAllAuctions(ws, auctionSubscriptions);
      // Clean up vault subscriptions and observers for this client
      vaultUnsubscribeAll(ws);
      removeVaultObserver(ws);
    });
  });

  return wss;
}
