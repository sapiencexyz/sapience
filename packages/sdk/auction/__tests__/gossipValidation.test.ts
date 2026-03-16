import { describe, it, expect } from 'vitest';
import { isValidGossipPayload } from '../gossipValidation';

describe('isValidGossipPayload', () => {
  const validPick = {
    conditionResolver: '0x1234567890abcdef1234567890abcdef12345678',
    conditionId: '0x' + 'ab'.repeat(32),
    predictedOutcome: 0,
  };

  describe('auction.start', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(true);
    });

    it('rejects missing picks', () => {
      expect(
        isValidGossipPayload('auction.start', {
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(false);
    });

    it('rejects invalid predictor address', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: 'not-an-address',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(false);
    });

    it('rejects missing collateral', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: 1,
        })
      ).toBe(false);
    });

    it('rejects invalid chainId', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 0,
        })
      ).toBe(false);
    });

    it('rejects invalid pick shape', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [{ conditionResolver: 'bad' }],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(false);
    });
  });

  describe('auction.started', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('auction.started', {
          auctionId: 'auction-123',
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(true);
    });

    it('rejects missing auctionId', () => {
      expect(
        isValidGossipPayload('auction.started', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(false);
    });
  });

  describe('auction.bids', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          auctionId: 'auction-123',
          bids: [
            {
              auctionId: 'auction-123',
              counterparty: '0x1234567890abcdef1234567890abcdef12345678',
              counterpartyCollateral: '500000',
            },
          ],
        })
      ).toBe(true);
    });

    it('accepts empty bids array', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          auctionId: 'auction-123',
          bids: [],
        })
      ).toBe(true);
    });

    it('rejects missing auctionId', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          bids: [],
        })
      ).toBe(false);
    });

    it('rejects bid with invalid counterparty', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          auctionId: 'auction-123',
          bids: [
            {
              auctionId: 'auction-123',
              counterparty: 'bad',
              counterpartyCollateral: '500000',
            },
          ],
        })
      ).toBe(false);
    });

    it('rejects bid missing counterpartyCollateral', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          auctionId: 'auction-123',
          bids: [
            {
              auctionId: 'auction-123',
              counterparty: '0x1234567890abcdef1234567890abcdef12345678',
            },
          ],
        })
      ).toBe(false);
    });
  });

  describe('bid.submit', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('bid.submit', {
          auctionId: 'auction-123',
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          counterpartyCollateral: '500000',
        })
      ).toBe(true);
    });

    it('rejects missing auctionId', () => {
      expect(
        isValidGossipPayload('bid.submit', {
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          counterpartyCollateral: '500000',
        })
      ).toBe(false);
    });
  });

  describe('bid.ack', () => {
    it('accepts payload with auctionId', () => {
      expect(
        isValidGossipPayload('bid.ack', { auctionId: 'auction-123' })
      ).toBe(true);
    });

    it('rejects missing auctionId', () => {
      expect(isValidGossipPayload('bid.ack', {})).toBe(false);
      expect(isValidGossipPayload('bid.ack', { bidId: '123' })).toBe(false);
    });
  });

  describe('auction.filled', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('auction.filled', {
          auctionId: 'auction-123',
          transactionHash: '0xabc',
        })
      ).toBe(true);
    });

    it('rejects missing transactionHash', () => {
      expect(
        isValidGossipPayload('auction.filled', {
          auctionId: 'auction-123',
        })
      ).toBe(false);
    });
  });

  describe('auction.expired', () => {
    it('accepts valid payload', () => {
      expect(
        isValidGossipPayload('auction.expired', {
          auctionId: 'auction-123',
          reason: 'timeout',
        })
      ).toBe(true);
    });
  });

  describe('vault_quote.update (removed)', () => {
    it('rejects vault_quote.update as it should not be gossiped', () => {
      expect(
        isValidGossipPayload('vault_quote.update', {
          vaultAddress: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: 1,
        })
      ).toBe(false);
    });
  });

  describe('order.created', () => {
    it('accepts payload with id', () => {
      expect(isValidGossipPayload('order.created', { id: 'order-1' })).toBe(
        true
      );
    });

    it('accepts payload with auctionId', () => {
      expect(isValidGossipPayload('order.created', { auctionId: 'a-1' })).toBe(
        true
      );
    });

    it('rejects payload without id or auctionId', () => {
      expect(isValidGossipPayload('order.created', { data: 'foo' })).toBe(
        false
      );
    });
  });

  describe('unknown types', () => {
    it('rejects unknown message types', () => {
      expect(isValidGossipPayload('evil.inject', { data: 'pwned' })).toBe(
        false
      );
    });
  });

  describe('edge cases', () => {
    it('rejects null payload', () => {
      expect(isValidGossipPayload('auction.bids', null)).toBe(false);
    });

    it('rejects non-object payload', () => {
      expect(isValidGossipPayload('auction.bids', 'string')).toBe(false);
      expect(isValidGossipPayload('auction.bids', 42)).toBe(false);
    });
  });
});
