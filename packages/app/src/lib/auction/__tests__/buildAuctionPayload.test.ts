import { decodeAbiParameters } from 'viem';
import {
  buildAuctionStartPayload,
  buildPythAuctionStartPayload,
  type PredictedOutcomeInputStub,
  type PythOutcomeInputStub,
} from '../buildAuctionPayload';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

// ---------------------------------------------------------------------------
// Polymarket / ConditionalTokens outcomes
// ---------------------------------------------------------------------------

describe('buildAuctionStartPayload — Polymarket outcome mapping', () => {
  const MARKET_ID = '0x' + 'ab'.repeat(32);

  function decodePolymarketOutcomes(encoded: `0x${string}`) {
    const [outcomes] = decodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'marketId', type: 'bytes32' },
            { name: 'prediction', type: 'bool' },
          ],
        },
      ],
      encoded
    );
    return outcomes as readonly { marketId: string; prediction: boolean }[];
  }

  it('prediction: true encodes as YES (prediction === true in decoded output)', () => {
    const outcomes: PredictedOutcomeInputStub[] = [
      { marketId: MARKET_ID, prediction: true },
    ];

    const { predictedOutcomes } = buildAuctionStartPayload(
      outcomes,
      CHAIN_ID_ETHEREAL
    );
    const decoded = decodePolymarketOutcomes(
      predictedOutcomes[0] as `0x${string}`
    );

    expect(decoded).toHaveLength(1);
    expect(decoded[0].prediction).toBe(true);
  });

  it('prediction: false encodes as NO (prediction === false in decoded output)', () => {
    const outcomes: PredictedOutcomeInputStub[] = [
      { marketId: MARKET_ID, prediction: false },
    ];

    const { predictedOutcomes } = buildAuctionStartPayload(
      outcomes,
      CHAIN_ID_ETHEREAL
    );
    const decoded = decodePolymarketOutcomes(
      predictedOutcomes[0] as `0x${string}`
    );

    expect(decoded).toHaveLength(1);
    expect(decoded[0].prediction).toBe(false);
  });

  it('roundtrip: encode → decode preserves YES and NO across multi-outcome', () => {
    const outcomes: PredictedOutcomeInputStub[] = [
      { marketId: '0x' + 'aa'.repeat(32), prediction: true },
      { marketId: '0x' + 'bb'.repeat(32), prediction: false },
      { marketId: '0x' + 'cc'.repeat(32), prediction: true },
    ];

    const { predictedOutcomes } = buildAuctionStartPayload(
      outcomes,
      CHAIN_ID_ETHEREAL
    );
    const decoded = decodePolymarketOutcomes(
      predictedOutcomes[0] as `0x${string}`
    );

    expect(decoded).toHaveLength(3);
    expect(decoded[0].prediction).toBe(true); // YES
    expect(decoded[1].prediction).toBe(false); // NO
    expect(decoded[2].prediction).toBe(true); // YES
  });

  it('normalizes marketId without 0x prefix', () => {
    const rawId = 'ab'.repeat(32); // no 0x prefix
    const outcomes: PredictedOutcomeInputStub[] = [
      { marketId: rawId, prediction: true },
    ];

    const { predictedOutcomes } = buildAuctionStartPayload(
      outcomes,
      CHAIN_ID_ETHEREAL
    );
    const decoded = decodePolymarketOutcomes(
      predictedOutcomes[0] as `0x${string}`
    );

    expect(decoded[0].marketId.toLowerCase()).toBe(`0x${rawId}`);
    expect(decoded[0].prediction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pyth binary options
// ---------------------------------------------------------------------------

describe('buildPythAuctionStartPayload — Pyth outcome mapping', () => {
  // Use a future date to avoid test flakiness
  const futureDate = new Date(Date.now() + 86400000);
  const dateTimeLocal = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}T${String(futureDate.getHours()).padStart(2, '0')}:${String(futureDate.getMinutes()).padStart(2, '0')}`;

  const basePythOutcome: PythOutcomeInputStub = {
    priceId: '1',
    direction: 'over',
    targetPrice: 100,
    priceExpo: -2,
    dateTimeLocal,
  };

  it('direction "over" → predictedOutcome: 0 (YES)', () => {
    const { escrowPicks } = buildPythAuctionStartPayload(
      [{ ...basePythOutcome, direction: 'over' }],
      CHAIN_ID_ETHEREAL
    );

    expect(escrowPicks).toHaveLength(1);
    expect(escrowPicks[0].predictedOutcome).toBe(0);
  });

  it('direction "under" → predictedOutcome: 1 (NO)', () => {
    const { escrowPicks } = buildPythAuctionStartPayload(
      [{ ...basePythOutcome, direction: 'under' }],
      CHAIN_ID_ETHEREAL
    );

    expect(escrowPicks).toHaveLength(1);
    expect(escrowPicks[0].predictedOutcome).toBe(1);
  });

  it('mixed directions produce correct outcomes', () => {
    const { escrowPicks } = buildPythAuctionStartPayload(
      [
        { ...basePythOutcome, priceId: '1', direction: 'over' },
        { ...basePythOutcome, priceId: '2', direction: 'under' },
      ],
      CHAIN_ID_ETHEREAL
    );

    expect(escrowPicks).toHaveLength(2);
    expect(escrowPicks[0].predictedOutcome).toBe(0); // over = YES
    expect(escrowPicks[1].predictedOutcome).toBe(1); // under = NO
  });
});
