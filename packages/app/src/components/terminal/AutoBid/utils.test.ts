import { getConditionMatchInfo } from './utils';
import type { Order } from './types';

// Helper to create a minimal order with condition selections
const createOrder = (
  conditionSelections: Array<{ id: string; outcome: 'yes' | 'no' }>
): Order => ({
  id: 'test-order',
  expiration: null,
  autoPausedAt: null,
  strategy: 'conditions',
  conditionSelections,
  odds: 50,
  status: 'active',
});

// Helper to create auction legs (requester's predictions)
const createAuctionLegs = (
  legs: Array<{ marketId: string; prediction: boolean }>
) => legs;

describe('getConditionMatchInfo', () => {
  describe('Single-condition order scenarios', () => {
    it('returns direct match when bidder wants Yes and requester predicts false (opposite sides)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('returns inverted match when bidder wants Yes and requester predicts true (same sides)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: true },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: true });
    });

    it('returns direct match when bidder wants No and requester predicts true (opposite sides)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'no' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: true },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('returns inverted match when bidder wants No and requester predicts false (same sides)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'no' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: true });
    });

    it('returns null when market is not in auction', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-b', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns direct match when single-condition order matches one leg of a multi-leg position (opposite)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        { marketId: '0xmarket-b', prediction: true },
        { marketId: '0xmarket-c', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('returns inverted match when single-condition order matches one leg of a multi-leg position (same side)', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: true },
        { marketId: '0xmarket-b', prediction: false },
        { marketId: '0xmarket-c', prediction: true },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: true });
    });
  });

  describe('Multi-condition order scenarios', () => {
    it('returns direct match when all conditions are opposite sides', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        { marketId: '0xmarket-b', prediction: true },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('returns null when one condition has same side (no inverted for multi-condition)', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: true }, // same side - fails
        { marketId: '0xmarket-b', prediction: true }, // opposite - passes
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns null when one condition is missing from auction', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        // market-b is missing
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns null when all conditions have same side', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: true }, // same side
        { marketId: '0xmarket-b', prediction: false }, // same side
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns direct match when order conditions are subset of auction legs (all opposite)', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        { marketId: '0xmarket-b', prediction: true },
        { marketId: '0xmarket-c', prediction: false }, // extra leg ignored
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('returns null when auction is subset of order (missing conditions)', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
        { id: '0xmarket-c', outcome: 'yes' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        { marketId: '0xmarket-b', prediction: true },
        // market-c is missing
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns null with partial overlap (some markets missing)', () => {
      const order = createOrder([
        { id: '0xmarket-a', outcome: 'yes' },
        { id: '0xmarket-b', outcome: 'no' },
      ]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
        { marketId: '0xmarket-c', prediction: true }, // different market
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('returns null when order has no condition selections', () => {
      const order = createOrder([]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns null when order conditionSelections is undefined', () => {
      const order: Order = {
        id: 'test-order',
        expiration: null,
        autoPausedAt: null,
        strategy: 'conditions',
        conditionSelections: undefined,
        odds: 50,
        status: 'active',
      };
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('returns null when auction has no legs', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toBeNull();
    });

    it('handles case-insensitive market ID matching', () => {
      const order = createOrder([{ id: '0xMARKET-A', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xmarket-a', prediction: false },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: false });
    });

    it('handles mixed case in auction legs', () => {
      const order = createOrder([{ id: '0xmarket-a', outcome: 'yes' }]);
      const auctionLegs = createAuctionLegs([
        { marketId: '0xMARKET-A', prediction: true },
      ]);

      const result = getConditionMatchInfo(order, auctionLegs);

      expect(result).toEqual({ inverted: true });
    });
  });
});
