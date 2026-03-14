import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientConnection, SubscriptionManager } from '../transport/types';

// ── Mock SDK validation ────────────────────────────────────────────────────
vi.mock('@sapience/sdk/auction/validation', () => ({
  validateAuctionRFQ: vi.fn(),
  validateBid: vi.fn(),
}));

// ── Mock contract addresses ────────────────────────────────────────────────
vi.mock('@sapience/sdk/contracts/addresses', () => ({
  predictionMarketEscrow: {
    5064014: { address: '0xEscrowAddress' },
  },
}));

// ── Mock escrowRegistry ────────────────────────────────────────────────────
vi.mock('../escrowRegistry', () => ({
  upsertEscrowAuction: vi.fn(() => 'auction-123'),
  getEscrowAuction: vi.fn(),
  addEscrowBid: vi.fn(),
  getEscrowBids: vi.fn(() => []),
  getEscrowAuctionDetails: vi.fn(),
}));

// ── Mock metrics (no-op counters) ──────────────────────────────────────────
vi.mock('../metrics', () => ({
  auctionsStarted: { inc: vi.fn() },
  bidsSubmitted: { inc: vi.fn() },
  errorsTotal: { inc: vi.fn() },
  subscriptionsActive: { inc: vi.fn(), dec: vi.fn() },
  vaultQuotesPublished: { inc: vi.fn() },
}));

// ── Mock viem ──────────────────────────────────────────────────────────────
vi.mock('viem', () => ({
  verifyMessage: vi.fn(),
}));

// ── Mock getProviderForChain ───────────────────────────────────────────────
vi.mock('../utils/getProviderForChain', () => ({
  getProviderForChain: vi.fn(() => ({
    readContract: vi.fn().mockResolvedValue('0xManagerAddress'),
  })),
}));

import {
  handleAuctionStart,
  handleAuctionSubscribe,
  handleAuctionUnsubscribe,
  handleBidSubmit,
} from '../handlers/escrow';
import {
  handleVaultObserve,
  handleVaultUnobserve,
  handleVaultSubscribe,
  handleVaultUnsubscribe,
  handleVaultQuotePublish,
  clearVaultState,
} from '../handlers/vault';
import {
  validateAuctionRFQ,
  validateBid,
} from '@sapience/sdk/auction/validation';
import {
  upsertEscrowAuction,
  getEscrowAuction,
  addEscrowBid,
  getEscrowBids,
  getEscrowAuctionDetails,
} from '../escrowRegistry';
import {
  auctionsStarted,
  bidsSubmitted,
  errorsTotal,
  subscriptionsActive,
  vaultQuotesPublished,
} from '../metrics';
import { verifyMessage } from 'viem';

// ============================================================================
// Test helpers
// ============================================================================

function mockClient(id = crypto.randomUUID()): ClientConnection {
  return {
    id,
    send: vi.fn(),
    close: vi.fn(),
    get isOpen() {
      return true;
    },
  };
}

function mockSubs(): SubscriptionManager & {
  _calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {};
  const track =
    (name: string, ret?: unknown) =>
    (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return ret;
    };
  return {
    _calls: calls,
    subscribe: vi.fn(
      track('subscribe', true)
    ) as unknown as SubscriptionManager['subscribe'],
    unsubscribe: vi.fn(
      track('unsubscribe', true)
    ) as unknown as SubscriptionManager['unsubscribe'],
    unsubscribeAll: vi.fn(
      track('unsubscribeAll', 0)
    ) as unknown as SubscriptionManager['unsubscribeAll'],
    unsubscribeByPrefix: vi.fn(
      track('unsubscribeByPrefix', 0)
    ) as unknown as SubscriptionManager['unsubscribeByPrefix'],
    broadcast: vi.fn(
      track('broadcast', 1)
    ) as unknown as SubscriptionManager['broadcast'],
    broadcastRaw: vi.fn(
      track('broadcastRaw', 0)
    ) as unknown as SubscriptionManager['broadcastRaw'],
    subscriberCount: vi.fn(
      track('subscriberCount', 0)
    ) as unknown as SubscriptionManager['subscriberCount'],
  };
}

const baseAuctionPayload = {
  predictor: '0x1234567890abcdef1234567890abcdef12345678',
  predictorCollateral: '1000000',
  counterpartyCollateral: '1000000',
  picks: [
    {
      conditionResolver: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      conditionId: '0x01',
      predictedOutcome: 1,
    },
  ],
  chainId: 5064014,
  predictorNonce: 1,
  predictorDeadline: Math.floor(Date.now() / 1000) + 3600,
};

// ============================================================================
// Escrow handler tests
// ============================================================================

describe('Escrow Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleAuctionStart', () => {
    const ctx = { allClients: () => [] as ClientConnection[] };

    it('sends ack with auctionId on valid payload', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({ status: 'valid' });
      vi.mocked(getEscrowAuctionDetails).mockReturnValue(undefined);

      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(client, baseAuctionPayload as never, subs, ctx);

      expect(validateAuctionRFQ).toHaveBeenCalledOnce();
      expect(upsertEscrowAuction).toHaveBeenCalledWith(baseAuctionPayload);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({ auctionId: 'auction-123' }),
        })
      );
      expect(auctionsStarted.inc).toHaveBeenCalled();
    });

    it('rejects invalid payload with error ack', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({
        status: 'invalid',
        code: 'MISSING_FIELD',
        reason: 'missing_predictor',
      });

      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(client, baseAuctionPayload as never, subs, ctx);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({ error: 'missing_predictor' }),
        })
      );
      expect(upsertEscrowAuction).not.toHaveBeenCalled();
      expect(errorsTotal.inc).toHaveBeenCalled();
    });

    it('rejects unknown chainId before validation', async () => {
      const client = mockClient();
      const subs = mockSubs();
      const payload = { ...baseAuctionPayload, chainId: 999999 };

      await handleAuctionStart(client, payload as never, subs, ctx);

      expect(validateAuctionRFQ).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({ error: 'unknown_chain_id' }),
        })
      );
    });

    it('subscribes client to auction topic', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({ status: 'valid' });
      vi.mocked(getEscrowAuctionDetails).mockReturnValue(undefined);

      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(client, baseAuctionPayload as never, subs, ctx);

      expect(subs.subscribe).toHaveBeenCalledWith(
        'auction:auction-123',
        client
      );
      expect(subscriptionsActive.inc).toHaveBeenCalledWith({
        subscription_type: 'auction',
      });
    });

    it('broadcasts auction.started to all clients', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({ status: 'valid' });
      const details = { auctionId: 'auction-123', picks: [] };
      vi.mocked(getEscrowAuctionDetails).mockReturnValue(details as never);

      const bot1 = mockClient('bot1-0000-0000-0000-000000000000');
      const bot2 = mockClient('bot2-0000-0000-0000-000000000000');
      const ctx2 = { allClients: () => [bot1, bot2] };
      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(client, baseAuctionPayload as never, subs, ctx2);

      // All clients should receive the auction.started broadcast
      expect(bot1.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'auction.started' })
      );
      expect(bot2.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'auction.started' })
      );
    });

    it('echoes requestId in ack when provided', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({ status: 'valid' });
      vi.mocked(getEscrowAuctionDetails).mockReturnValue(undefined);

      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(
        client,
        baseAuctionPayload as never,
        subs,
        ctx,
        'req-42'
      );

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({
            auctionId: 'auction-123',
            id: 'req-42',
          }),
        })
      );
    });

    it('streams existing bids when present', async () => {
      vi.mocked(validateAuctionRFQ).mockResolvedValue({ status: 'valid' });
      vi.mocked(getEscrowAuctionDetails).mockReturnValue(undefined);
      const existingBids = [
        { auctionId: 'auction-123', counterparty: '0xBob' },
      ];
      vi.mocked(getEscrowBids).mockReturnValue(existingBids as never);

      const client = mockClient();
      const subs = mockSubs();

      await handleAuctionStart(client, baseAuctionPayload as never, subs, ctx);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.bids',
          payload: expect.objectContaining({
            auctionId: 'auction-123',
            bids: existingBids,
          }),
        })
      );
    });
  });

  describe('handleAuctionSubscribe', () => {
    it('subscribes client and sends ack', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleAuctionSubscribe(client, 'abc-123', subs);

      expect(subs.subscribe).toHaveBeenCalledWith('auction:abc-123', client);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({
            auctionId: 'abc-123',
            subscribed: true,
          }),
        })
      );
    });

    it('streams existing bids to new subscriber', () => {
      const bids = [{ auctionId: 'abc-123', counterparty: '0xAlice' }];
      vi.mocked(getEscrowBids).mockReturnValue(bids as never);

      const client = mockClient();
      const subs = mockSubs();

      handleAuctionSubscribe(client, 'abc-123', subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.bids',
          payload: expect.objectContaining({ auctionId: 'abc-123', bids }),
        })
      );
    });

    it('rejects missing auctionId', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleAuctionSubscribe(client, undefined, subs);

      expect(subs.subscribe).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({ error: 'missing_auction_id' }),
        })
      );
    });

    it('rejects empty string auctionId', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleAuctionSubscribe(client, '', subs);

      expect(subs.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleAuctionUnsubscribe', () => {
    it('unsubscribes client and sends ack', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleAuctionUnsubscribe(client, 'abc-123', subs);

      expect(subs.unsubscribe).toHaveBeenCalledWith('auction:abc-123', client);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({
            auctionId: 'abc-123',
            unsubscribed: true,
          }),
        })
      );
    });

    it('rejects missing auctionId', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleAuctionUnsubscribe(client, undefined, subs);

      expect(subs.unsubscribe).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auction.ack',
          payload: expect.objectContaining({ error: 'missing_auction_id' }),
        })
      );
    });

    it('does not decrement metric when client was not subscribed', () => {
      const client = mockClient();
      const subs = mockSubs();
      vi.mocked(subs.unsubscribe).mockReturnValue(false);

      handleAuctionUnsubscribe(client, 'abc-123', subs);

      expect(subs.unsubscribe).toHaveBeenCalledWith('auction:abc-123', client);
      expect(subscriptionsActive.dec).not.toHaveBeenCalled();
    });
  });

  describe('handleBidSubmit', () => {
    const baseBid = {
      auctionId: 'auction-123',
      counterparty: '0xBob',
      counterpartyCollateral: '500000',
      counterpartyNonce: 1,
      counterpartyDeadline: Math.floor(Date.now() / 1000) + 3600,
      counterpartySignature: '0xsig',
    };

    it('validates and accepts bid, broadcasts to subscribers', async () => {
      const auctionRecord = {
        auction: { ...baseAuctionPayload },
        bids: [],
        deadlineMs: Date.now() + 60000,
      };
      vi.mocked(getEscrowAuction).mockReturnValue(auctionRecord as never);
      vi.mocked(validateBid).mockResolvedValue({ status: 'valid' });
      const validatedBid = { ...baseBid, receivedAt: new Date().toISOString() };
      vi.mocked(addEscrowBid).mockReturnValue(validatedBid as never);
      vi.mocked(getEscrowBids).mockReturnValue([validatedBid] as never);

      const client = mockClient();
      const subs = mockSubs();

      await handleBidSubmit(client, baseBid as never, subs);

      expect(validateBid).toHaveBeenCalledOnce();
      expect(addEscrowBid).toHaveBeenCalledWith('auction-123', baseBid);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'bid.ack', payload: {} })
      );
      expect(bidsSubmitted.inc).toHaveBeenCalledWith({ status: 'success' });
      expect(subs.broadcast).toHaveBeenCalledWith(
        'auction:auction-123',
        expect.objectContaining({ type: 'auction.bids' })
      );
    });

    it('rejects bid for non-existent auction', async () => {
      vi.mocked(getEscrowAuction).mockReturnValue(undefined);

      const client = mockClient();
      const subs = mockSubs();

      await handleBidSubmit(client, baseBid as never, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bid.ack',
          payload: expect.objectContaining({
            error: 'auction_not_found_or_expired',
          }),
        })
      );
      expect(bidsSubmitted.inc).toHaveBeenCalledWith({ status: 'rejected' });
      expect(validateBid).not.toHaveBeenCalled();
    });

    it('rejects bid that fails validation', async () => {
      vi.mocked(getEscrowAuction).mockReturnValue({
        auction: baseAuctionPayload,
        bids: [],
        deadlineMs: Date.now() + 60000,
      } as never);
      vi.mocked(validateBid).mockResolvedValue({
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'signature_mismatch',
      });

      const client = mockClient();
      const subs = mockSubs();

      await handleBidSubmit(client, baseBid as never, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bid.ack',
          payload: expect.objectContaining({ error: 'signature_mismatch' }),
        })
      );
      expect(bidsSubmitted.inc).toHaveBeenCalledWith({ status: 'rejected' });
      expect(addEscrowBid).not.toHaveBeenCalled();
    });

    it('passes through unverified bids', async () => {
      vi.mocked(getEscrowAuction).mockReturnValue({
        auction: baseAuctionPayload,
        bids: [],
        deadlineMs: Date.now() + 60000,
      } as never);
      vi.mocked(validateBid).mockResolvedValue({
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'smart_contract_signer',
      });
      vi.mocked(addEscrowBid).mockReturnValue({
        ...baseBid,
        receivedAt: new Date().toISOString(),
      } as never);
      vi.mocked(getEscrowBids).mockReturnValue([]);

      const client = mockClient();
      const subs = mockSubs();

      await handleBidSubmit(client, baseBid as never, subs);

      // Unverified should still pass through
      expect(addEscrowBid).toHaveBeenCalled();
      expect(bidsSubmitted.inc).toHaveBeenCalledWith({ status: 'success' });
    });
  });
});

// ============================================================================
// Vault handler tests
// ============================================================================

describe('Vault Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVaultState();
  });

  describe('handleVaultObserve', () => {
    it('subscribes client to observers:vault topic', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultObserve(client, subs);

      expect(subs.subscribe).toHaveBeenCalledWith('observers:vault', client);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ ok: true }),
        })
      );
    });
  });

  describe('handleVaultUnobserve', () => {
    it('unsubscribes client from observers:vault topic', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultUnobserve(client, subs);

      expect(subs.unsubscribe).toHaveBeenCalledWith('observers:vault', client);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ ok: true }),
        })
      );
    });
  });

  describe('handleVaultSubscribe', () => {
    it('subscribes to vault topic and acks', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultSubscribe(
        client,
        { chainId: 1, vaultAddress: '0xVault' },
        subs
      );

      expect(subs.subscribe).toHaveBeenCalledWith('vault:1:0xvault', client);
      expect(subscriptionsActive.inc).toHaveBeenCalledWith({
        subscription_type: 'vault',
      });
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ ok: true }),
        })
      );
    });

    it('broadcasts vault_quote.requested to observers', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultSubscribe(
        client,
        { chainId: 42, vaultAddress: '0xABC' },
        subs
      );

      expect(subs.broadcast).toHaveBeenCalledWith(
        'observers:vault',
        expect.objectContaining({
          type: 'vault_quote.requested',
          payload: expect.objectContaining({
            chainId: 42,
            vaultAddress: '0xabc',
          }),
        })
      );
    });

    it('rejects missing chainId', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultSubscribe(
        client,
        { chainId: 0, vaultAddress: '0xVault' },
        subs
      );

      expect(subs.subscribe).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'invalid_subscribe' }),
        })
      );
    });

    it('rejects missing vaultAddress', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultSubscribe(client, { chainId: 1, vaultAddress: '' }, subs);

      expect(subs.subscribe).not.toHaveBeenCalled();
    });

    it('rejects undefined payload', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultSubscribe(client, undefined, subs);

      expect(subs.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleVaultUnsubscribe', () => {
    it('unsubscribes from vault topic and acks', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultUnsubscribe(
        client,
        { chainId: 1, vaultAddress: '0xVault' },
        subs
      );

      expect(subs.unsubscribe).toHaveBeenCalledWith('vault:1:0xvault', client);
    });

    it('is no-op for missing payload', () => {
      const client = mockClient();
      const subs = mockSubs();

      handleVaultUnsubscribe(client, undefined, subs);

      expect(subs.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('handleVaultQuotePublish', () => {
    const validPayload = {
      chainId: 5064014,
      vaultAddress: '0xVaultAddr',
      vaultCollateralPerShare: '1000000000000000000',
      timestamp: Date.now(),
      signedBy: '0xManagerAddress',
      signature: '0xvalidSig',
    };

    it('rejects missing fields', async () => {
      const client = mockClient();
      const subs = mockSubs();

      await handleVaultQuotePublish(client, undefined, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'invalid_payload' }),
        })
      );
      expect(vaultQuotesPublished.inc).toHaveBeenCalledWith({
        status: 'error',
      });
    });

    it('rejects stale timestamp', async () => {
      const client = mockClient();
      const subs = mockSubs();
      const stalePayload = {
        ...validPayload,
        timestamp: Date.now() - 10 * 60 * 1000, // 10 min old
      };

      await handleVaultQuotePublish(client, stalePayload, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'stale_timestamp' }),
        })
      );
    });

    it('rejects bad signature', async () => {
      vi.mocked(verifyMessage).mockResolvedValue(false);

      const client = mockClient();
      const subs = mockSubs();

      await handleVaultQuotePublish(client, validPayload, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'bad_signature' }),
        })
      );
    });

    it('rejects unauthorized signer', async () => {
      vi.mocked(verifyMessage).mockResolvedValue(true);

      const client = mockClient();
      const subs = mockSubs();
      const payload = { ...validPayload, signedBy: '0xUnauthorized' };

      await handleVaultQuotePublish(client, payload, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'unauthorized_signer' }),
        })
      );
      expect(vaultQuotesPublished.inc).toHaveBeenCalledWith({
        status: 'unauthorized',
      });
    });

    it('accepts valid quote, broadcasts to subscribers and observers', async () => {
      vi.mocked(verifyMessage).mockResolvedValue(true);

      const client = mockClient();
      const subs = mockSubs();
      const payload = {
        ...validPayload,
        signedBy: '0xmanageraddress', // lowercase to match cache
      };

      await handleVaultQuotePublish(client, payload, subs);

      expect(vaultQuotesPublished.inc).toHaveBeenCalledWith({
        status: 'success',
      });
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ ok: true }),
        })
      );
      // Broadcasts to vault subscribers and observers
      expect(subs.broadcast).toHaveBeenCalledWith(
        expect.stringContaining('vault:'),
        expect.objectContaining({ type: 'vault_quote.update' })
      );
      expect(subs.broadcast).toHaveBeenCalledWith(
        'observers:vault',
        expect.objectContaining({ type: 'vault_quote.update' })
      );
    });

    it('handles internal errors gracefully', async () => {
      vi.mocked(verifyMessage).mockRejectedValue(new Error('boom'));

      const client = mockClient();
      const subs = mockSubs();

      await handleVaultQuotePublish(client, validPayload, subs);

      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'vault_quote.ack',
          payload: expect.objectContaining({ error: 'boom' }),
        })
      );
      expect(vaultQuotesPublished.inc).toHaveBeenCalledWith({
        status: 'error',
      });
    });
  });
});
