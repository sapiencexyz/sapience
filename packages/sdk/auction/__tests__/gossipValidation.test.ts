import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  isValidGossipPayload,
  validateGossipPayloadAsync,
  type GossipValidationContext,
} from '../gossipValidation';
import { buildAuctionIntentTypedData } from '../escrowSigning';
import type { AuctionRFQPayload, PickJson } from '../../types/escrow';

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

  describe('length bounds', () => {
    const validPick = {
      conditionResolver: '0x1234567890abcdef1234567890abcdef12345678',
      conditionId: '0x' + 'ab'.repeat(32),
      predictedOutcome: 0,
    };

    it('rejects conditionId exceeding max length (322 chars)', () => {
      const oversizedPick = {
        ...validPick,
        conditionId: '0x' + 'ab'.repeat(200), // 402 chars, over 322 limit
      };
      expect(
        isValidGossipPayload('auction.start', {
          picks: [oversizedPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(false);
    });

    it('accepts conditionId at max length (322 chars)', () => {
      const maxPick = {
        ...validPick,
        conditionId: '0x' + 'ab'.repeat(160), // 322 chars, exactly at limit
      };
      expect(
        isValidGossipPayload('auction.start', {
          picks: [maxPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '1000000',
          chainId: 1,
        })
      ).toBe(true);
    });

    it('rejects predictorCollateral exceeding max length', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '9'.repeat(100), // 100 digits, over 78 limit
          chainId: 1,
        })
      ).toBe(false);
    });

    it('accepts predictorCollateral at max length (78 digits)', () => {
      expect(
        isValidGossipPayload('auction.start', {
          picks: [validPick],
          predictor: '0x1234567890abcdef1234567890abcdef12345678',
          predictorCollateral: '9'.repeat(78),
          chainId: 1,
        })
      ).toBe(true);
    });

    it('rejects counterpartyCollateral exceeding max length in bid.submit', () => {
      expect(
        isValidGossipPayload('bid.submit', {
          auctionId: 'auction-123',
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          counterpartyCollateral: '9'.repeat(100),
        })
      ).toBe(false);
    });

    it('rejects counterpartyCollateral exceeding max length in auction.bids', () => {
      expect(
        isValidGossipPayload('auction.bids', {
          auctionId: 'auction-123',
          bids: [
            {
              auctionId: 'auction-123',
              counterparty: '0x1234567890abcdef1234567890abcdef12345678',
              counterpartyCollateral: '9'.repeat(100),
            },
          ],
        })
      ).toBe(false);
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

// ─── validateGossipPayloadAsync ─────────────────────────────────────────────

const VERIFYING_CONTRACT =
  '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 42161;
const CONDITION_RESOLVER =
  '0x2222222222222222222222222222222222222222' as Address;
const CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const TEST_PICKS: PickJson[] = [
  {
    conditionResolver: CONDITION_RESOLVER,
    conditionId: CONDITION_ID,
    predictedOutcome: 1,
  },
];

const TEST_PICKS_SDK = TEST_PICKS.map((p) => ({
  conditionResolver: p.conditionResolver as Address,
  conditionId: p.conditionId as Hex,
  predictedOutcome: p.predictedOutcome,
}));

function futureDeadline(offsetSec = 3600): number {
  return Math.floor(Date.now() / 1000) + offsetSec;
}

async function makeSignedAuctionRFQ(
  overrides: Partial<AuctionRFQPayload> = {}
): Promise<{ payload: AuctionRFQPayload }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const deadline = futureDeadline();
  const nonce = 1;

  const typedData = buildAuctionIntentTypedData({
    picks: TEST_PICKS_SDK,
    predictor: account.address,
    predictorCollateral: BigInt('1000000000000000000'),
    predictorNonce: BigInt(nonce),
    predictorDeadline: BigInt(deadline),
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  });

  const intentSignature = await account.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    payload: {
      picks: TEST_PICKS,
      predictorCollateral: '1000000000000000000',
      predictor: account.address,
      predictorNonce: nonce,
      predictorDeadline: deadline,
      intentSignature,
      chainId: CHAIN_ID,
      ...overrides,
    },
  };
}

function makeCtx(): GossipValidationContext {
  return {
    verifyingContract: VERIFYING_CONTRACT,
    chainId: CHAIN_ID,
  };
}

describe('validateGossipPayloadAsync', () => {
  // ── structural rejection (delegates to isValidGossipPayload) ──

  it('rejects structurally invalid payloads', async () => {
    expect(
      await validateGossipPayloadAsync(
        'auction.start',
        { bad: true },
        makeCtx()
      )
    ).toBe(false);
  });

  it('rejects unknown message types', async () => {
    expect(
      await validateGossipPayloadAsync(
        'evil.inject',
        { data: 'pwned' },
        makeCtx()
      )
    ).toBe(false);
  });

  it('returns false when signature verification throws', async () => {
    // Build a payload that passes structural checks but will cause
    // validateAuctionRFQ to throw (e.g., malformed signature data).
    const { payload } = await makeSignedAuctionRFQ();
    // Corrupt the signature to a value that passes the format regex
    // but causes viem's verifyTypedData to throw internally.
    payload.intentSignature = ('0x' + 'ff'.repeat(65)) as `0x${string}`;
    const result = await validateGossipPayloadAsync(
      'auction.start',
      payload,
      makeCtx()
    );
    expect(result).toBe(false);
  });

  // ── auction.start ──

  describe('auction.start', () => {
    it('accepts with valid intent signature', async () => {
      const { payload } = await makeSignedAuctionRFQ();
      expect(
        await validateGossipPayloadAsync('auction.start', payload, makeCtx())
      ).toBe(true);
    });

    it('rejects without intent signature', async () => {
      const { payload } = await makeSignedAuctionRFQ();
      delete (payload as Record<string, unknown>).intentSignature;
      expect(
        await validateGossipPayloadAsync('auction.start', payload, makeCtx())
      ).toBe(false);
    });

    it('rejects with forged intent signature', async () => {
      const { payload } = await makeSignedAuctionRFQ();
      // Sign with a different key
      const imposter = privateKeyToAccount(generatePrivateKey());
      const typedData = buildAuctionIntentTypedData({
        picks: TEST_PICKS_SDK,
        predictor: imposter.address,
        predictorCollateral: BigInt(payload.predictorCollateral),
        predictorNonce: BigInt(payload.predictorNonce),
        predictorDeadline: BigInt(payload.predictorDeadline),
        verifyingContract: VERIFYING_CONTRACT,
        chainId: CHAIN_ID,
      });
      payload.intentSignature = await imposter.signTypedData({
        domain: {
          ...typedData.domain,
          chainId: Number(typedData.domain.chainId),
        },
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      // predictor address doesn't match the signer
      expect(
        await validateGossipPayloadAsync('auction.start', payload, makeCtx())
      ).toBe(false);
    });

    it('rejects with expired deadline', async () => {
      const pastDeadline = Math.floor(Date.now() / 1000) - 100;
      const { payload } = await makeSignedAuctionRFQ({
        predictorDeadline: pastDeadline,
      });
      expect(
        await validateGossipPayloadAsync('auction.start', payload, makeCtx())
      ).toBe(false);
    });
  });

  // ── auction.started (same validation as auction.start) ──

  describe('auction.started', () => {
    it('accepts with valid intent signature', async () => {
      const { payload } = await makeSignedAuctionRFQ();
      const started = { ...payload, auctionId: 'auction-123' };
      expect(
        await validateGossipPayloadAsync('auction.started', started, makeCtx())
      ).toBe(true);
    });

    it('rejects without intent signature', async () => {
      const { payload } = await makeSignedAuctionRFQ();
      const started = { ...payload, auctionId: 'auction-123' };
      delete (started as Record<string, unknown>).intentSignature;
      expect(
        await validateGossipPayloadAsync('auction.started', started, makeCtx())
      ).toBe(false);
    });
  });

  // ── bid.submit / auction.bids (structural only, signatures verified on-chain) ──

  describe('bid.submit', () => {
    it('accepts structurally valid bid', async () => {
      expect(
        await validateGossipPayloadAsync(
          'bid.submit',
          {
            auctionId: 'auction-123',
            counterparty: '0x1234567890abcdef1234567890abcdef12345678',
            counterpartyCollateral: '500000',
          },
          makeCtx()
        )
      ).toBe(true);
    });
  });

  describe('auction.bids', () => {
    it('accepts structurally valid bids', async () => {
      expect(
        await validateGossipPayloadAsync(
          'auction.bids',
          {
            auctionId: 'auction-123',
            bids: [
              {
                auctionId: 'auction-123',
                counterparty: '0x1234567890abcdef1234567890abcdef12345678',
                counterpartyCollateral: '500000',
              },
            ],
          },
          makeCtx()
        )
      ).toBe(true);
    });

    it('accepts empty bids array', async () => {
      expect(
        await validateGossipPayloadAsync(
          'auction.bids',
          { auctionId: 'a-1', bids: [] },
          makeCtx()
        )
      ).toBe(true);
    });
  });

  // ── status messages (structural only) ──

  describe('status messages pass with structural check only', () => {
    it('bid.ack', async () => {
      expect(
        await validateGossipPayloadAsync(
          'bid.ack',
          { auctionId: 'a-1' },
          makeCtx()
        )
      ).toBe(true);
    });

    it('auction.filled', async () => {
      expect(
        await validateGossipPayloadAsync(
          'auction.filled',
          { auctionId: 'a-1', transactionHash: '0xabc' },
          makeCtx()
        )
      ).toBe(true);
    });

    it('auction.expired', async () => {
      expect(
        await validateGossipPayloadAsync(
          'auction.expired',
          { auctionId: 'a-1', reason: 'timeout' },
          makeCtx()
        )
      ).toBe(true);
    });

    it('order.created', async () => {
      expect(
        await validateGossipPayloadAsync(
          'order.created',
          { id: 'order-1' },
          makeCtx()
        )
      ).toBe(true);
    });
  });
});
