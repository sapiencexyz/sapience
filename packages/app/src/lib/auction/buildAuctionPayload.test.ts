/**
 * Tests for buildAuctionPayload.ts
 *
 * This is the bridge between UI inputs and the signing/auction layer.
 * If this builds wrong, signatures may be valid but the auction creates
 * the wrong market, or the resolver rejects the prediction.
 *
 * Covers:
 * - Polymarket outcome encoding (marketId normalization, prediction mapping)
 * - Pyth outcome encoding (priceId normalization, strike price scaling, datetime parsing)
 * - Resolver address selection (chain-specific, condition-provided, fallback)
 * - Edge cases (mixed resolvers, missing data, zero address fallback)
 */

import {
  buildAuctionStartPayload,
  buildPythAuctionStartPayload,
  type PredictedOutcomeInputStub,
  type PythOutcomeInputStub,
} from './buildAuctionPayload';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import {
  predictionMarketLZConditionalTokensResolver,
} from '@sapience/sdk/contracts';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ============================================================================
// Polymarket payload: buildAuctionStartPayload
// ============================================================================

describe('buildAuctionStartPayload', () => {
  describe('resolver selection', () => {
    test('uses condition-provided resolver when all outcomes share one', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        {
          marketId: '0x' + 'aa'.repeat(32),
          prediction: true,
          resolverAddress: '0x1234567890abcdef1234567890abcdef12345678',
        },
        {
          marketId: '0x' + 'bb'.repeat(32),
          prediction: false,
          resolverAddress: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ];

      const result = buildAuctionStartPayload(outcomes);
      expect(result.resolver.toLowerCase()).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
    });

    test('uses LZ resolver for Ethereal mainnet when no condition resolver', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      ];

      const result = buildAuctionStartPayload(outcomes, CHAIN_ID_ETHEREAL);
      const expectedResolver =
        predictionMarketLZConditionalTokensResolver[CHAIN_ID_ETHEREAL]?.address;

      if (expectedResolver) {
        expect(result.resolver.toLowerCase()).toBe(
          expectedResolver.toLowerCase()
        );
      } else {
        // If no resolver configured for this chain, should fall back to zero
        expect(result.resolver).toBe(ZERO_ADDRESS);
      }
    });

    test('uses LZ resolver for Ethereal testnet', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      ];

      const result = buildAuctionStartPayload(
        outcomes,
        CHAIN_ID_ETHEREAL_TESTNET
      );
      const expectedResolver =
        predictionMarketLZConditionalTokensResolver[CHAIN_ID_ETHEREAL_TESTNET]
          ?.address;

      if (expectedResolver) {
        expect(result.resolver.toLowerCase()).toBe(
          expectedResolver.toLowerCase()
        );
      }
    });

    test('falls back to zero address when no resolver found', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      ];

      // Use an unsupported chain ID
      const result = buildAuctionStartPayload(outcomes, 99999);
      expect(result.resolver).toBe(ZERO_ADDRESS);
    });

    test('warns but uses first resolver when outcomes have mixed resolvers', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const outcomes: PredictedOutcomeInputStub[] = [
        {
          marketId: '0x' + 'aa'.repeat(32),
          prediction: true,
          resolverAddress: '0x1111111111111111111111111111111111111111',
        },
        {
          marketId: '0x' + 'bb'.repeat(32),
          prediction: false,
          resolverAddress: '0x2222222222222222222222222222222222222222',
        },
      ];

      const result = buildAuctionStartPayload(outcomes);
      expect(result.resolver.toLowerCase()).toBe(
        '0x1111111111111111111111111111111111111111'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mixed resolvers')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('outcome encoding', () => {
    test('returns a single encoded bytes string in predictedOutcomes array', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      ];

      const result = buildAuctionStartPayload(outcomes, CHAIN_ID_ETHEREAL);
      expect(result.predictedOutcomes).toHaveLength(1);
      expect(result.predictedOutcomes[0]).toMatch(/^0x[0-9a-f]+$/i);
    });

    test('normalizes marketId without 0x prefix', () => {
      const withPrefix: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'ab'.repeat(32), prediction: true },
      ];
      const withoutPrefix: PredictedOutcomeInputStub[] = [
        { marketId: 'ab'.repeat(32), prediction: true },
      ];

      const result1 = buildAuctionStartPayload(withPrefix, CHAIN_ID_ETHEREAL);
      const result2 = buildAuctionStartPayload(
        withoutPrefix,
        CHAIN_ID_ETHEREAL
      );

      // Same market should produce same encoding
      expect(result1.predictedOutcomes[0]).toBe(
        result2.predictedOutcomes[0]
      );
    });

    test('different predictions produce different encodings', () => {
      const yes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      ];
      const no: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: false },
      ];

      const result1 = buildAuctionStartPayload(yes, CHAIN_ID_ETHEREAL);
      const result2 = buildAuctionStartPayload(no, CHAIN_ID_ETHEREAL);

      expect(result1.predictedOutcomes[0]).not.toBe(
        result2.predictedOutcomes[0]
      );
    });

    test('multi-outcome combo encodes all outcomes in single bytes', () => {
      const outcomes: PredictedOutcomeInputStub[] = [
        { marketId: '0x' + 'aa'.repeat(32), prediction: true },
        { marketId: '0x' + 'bb'.repeat(32), prediction: false },
        { marketId: '0x' + 'cc'.repeat(32), prediction: true },
      ];

      const result = buildAuctionStartPayload(outcomes, CHAIN_ID_ETHEREAL);
      // Still a single encoded blob (array of tuples)
      expect(result.predictedOutcomes).toHaveLength(1);

      // Single outcome should produce shorter encoding
      const single = buildAuctionStartPayload(
        [outcomes[0]],
        CHAIN_ID_ETHEREAL
      );
      expect(result.predictedOutcomes[0].length).toBeGreaterThan(
        single.predictedOutcomes[0].length
      );
    });
  });
});

// ============================================================================
// Pyth payload: buildPythAuctionStartPayload
// ============================================================================

describe('buildPythAuctionStartPayload', () => {
  const basePythOutcome: PythOutcomeInputStub = {
    priceId: '1', // uint32 feed ID
    direction: 'over',
    targetPrice: 50000,
    priceExpo: -8,
    dateTimeLocal: '2025-12-31T23:59',
  };

  describe('priceId normalization', () => {
    test('accepts base-10 integer string', () => {
      const result = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, priceId: '42' }],
        CHAIN_ID_ETHEREAL
      );
      expect(result.predictedOutcomes[0]).toMatch(/^0x/);
    });

    test('accepts hex uint32', () => {
      const result = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, priceId: '0xff' }],
        CHAIN_ID_ETHEREAL
      );
      expect(result.predictedOutcomes[0]).toMatch(/^0x/);
    });

    test('accepts bytes32 that fits uint32', () => {
      const bytes32 = '0x' + '0'.repeat(56) + 'deadbeef';
      const result = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, priceId: bytes32 }],
        CHAIN_ID_ETHEREAL
      );
      expect(result.predictedOutcomes[0]).toMatch(/^0x/);
    });

    test('rejects Hermes bytes32 price feed id (>uint32)', () => {
      const hermesPriceId = '0x' + 'ff'.repeat(32); // too big for uint32
      expect(() =>
        buildPythAuctionStartPayload(
          [{ ...basePythOutcome, priceId: hermesPriceId }],
          CHAIN_ID_ETHEREAL
        )
      ).toThrow(/pyth_lazer_feed_id_required/);
    });

    test('rejects empty priceId', () => {
      expect(() =>
        buildPythAuctionStartPayload(
          [{ ...basePythOutcome, priceId: '' }],
          CHAIN_ID_ETHEREAL
        )
      ).toThrow();
    });
  });

  describe('strike price scaling', () => {
    test('uses targetPriceRaw when available', () => {
      const withRaw = buildPythAuctionStartPayload(
        [
          {
            ...basePythOutcome,
            targetPrice: 50000,
            targetPriceRaw: '50000.12345678',
          },
        ],
        CHAIN_ID_ETHEREAL
      );
      const withoutRaw = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, targetPrice: 50000 }],
        CHAIN_ID_ETHEREAL
      );

      // Raw should produce different encoding due to decimal precision
      expect(withRaw.predictedOutcomes[0]).not.toBe(
        withoutRaw.predictedOutcomes[0]
      );
    });

    test('over vs under produce different encodings', () => {
      const over = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, direction: 'over' }],
        CHAIN_ID_ETHEREAL
      );
      const under = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, direction: 'under' }],
        CHAIN_ID_ETHEREAL
      );

      expect(over.predictedOutcomes[0]).not.toBe(
        under.predictedOutcomes[0]
      );
    });
  });

  describe('datetime parsing', () => {
    test('parses valid datetime-local format', () => {
      // Should not throw
      const result = buildPythAuctionStartPayload(
        [{ ...basePythOutcome, dateTimeLocal: '2025-06-15T14:30' }],
        CHAIN_ID_ETHEREAL
      );
      expect(result.predictedOutcomes[0]).toMatch(/^0x/);
    });

    test('rejects invalid datetime format', () => {
      expect(() =>
        buildPythAuctionStartPayload(
          [{ ...basePythOutcome, dateTimeLocal: 'not-a-date' }],
          CHAIN_ID_ETHEREAL
        )
      ).toThrow('invalid_datetime_local');
    });
  });

  describe('resolver selection', () => {
    test('returns zero address for unsupported chain', () => {
      const result = buildPythAuctionStartPayload(
        [basePythOutcome],
        99999
      );
      expect(result.resolver).toBe(ZERO_ADDRESS);
    });
  });
});
