/**
 * Tests for auction initiation utilities.
 *
 * Uses real EIP-712 signature generation (via viem's signTypedData with
 * test accounts) to verify the full prepareAuctionRFQ pipeline.
 *
 * initiateAuction is tested with a real ws server for the e2e flow.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  prepareAuctionRFQ,
  initiateAuction,
  type SignableTypedData,
  type PrepareAuctionRFQParams,
} from '../initiate';
import { canonicalizePicks, computePickConfigId } from '../escrowEncoding';
import type { Pick, PickJson } from '../../types/escrow';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VERIFYING_CONTRACT =
  '0x1111111111111111111111111111111111111111' as Address;
const CHAIN_ID = 42161;
const CONDITION_RESOLVER =
  '0x2222222222222222222222222222222222222222' as Address;
const CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const TEST_PICKS: Pick[] = [
  {
    conditionResolver: CONDITION_RESOLVER,
    conditionId: CONDITION_ID,
    predictedOutcome: 1,
  },
];

const TEST_PICKS_JSON: PickJson[] = [
  {
    conditionResolver: CONDITION_RESOLVER,
    conditionId: CONDITION_ID,
    predictedOutcome: 1,
  },
];

function makeTestAccount() {
  return privateKeyToAccount(generatePrivateKey());
}

/**
 * Create a real EIP-712 signer using a viem local account.
 */
function createTestSigner(account: ReturnType<typeof privateKeyToAccount>) {
  return async (typedData: SignableTypedData): Promise<Hex> => {
    return account.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType as 'AuctionIntent',
      message: typedData.message,
    });
  };
}

function makeDefaultParams(
  overrides: Partial<PrepareAuctionRFQParams> = {}
): PrepareAuctionRFQParams {
  const account = makeTestAccount();
  return {
    picks: TEST_PICKS,
    predictorCollateral: 1000000000000000000n, // 1 ETH in wei
    predictor: account.address,
    chainId: CHAIN_ID,
    nonce: 42,
    signIntent: createTestSigner(account),
    options: {
      verifyingContract: VERIFYING_CONTRACT,
    },
    ...overrides,
  };
}

// ─── prepareAuctionRFQ ───────────────────────────────────────────────────────

describe('prepareAuctionRFQ', () => {
  test('assembles valid signed payload from Pick[]', async () => {
    const account = makeTestAccount();
    const params = makeDefaultParams({
      predictor: account.address,
      signIntent: createTestSigner(account),
    });

    const result = await prepareAuctionRFQ(params);

    // Payload fields
    expect(result.payload.predictor).toBe(account.address);
    expect(result.payload.predictorCollateral).toBe('1000000000000000000');
    expect(result.payload.predictorNonce).toBe(42);
    expect(result.payload.chainId).toBe(CHAIN_ID);
    expect(result.payload.intentSignature).toBeDefined();
    expect(result.payload.intentSignature).toMatch(/^0x/);

    // Picks are canonicalized in the payload
    expect(result.payload.picks).toHaveLength(1);
    expect(result.payload.picks[0].conditionResolver).toBe(CONDITION_RESOLVER);

    // pickConfigId matches direct computation
    const expectedPickConfigId = computePickConfigId(
      canonicalizePicks(TEST_PICKS)
    );
    expect(result.pickConfigId).toBe(expectedPickConfigId);

    // canonicalPicks returned
    expect(result.canonicalPicks).toHaveLength(1);

    // Deadline is in the future
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result.deadline).toBeGreaterThan(nowSec);
    expect(result.deadline).toBeLessThanOrEqual(nowSec + 31); // default 30s + 1s tolerance
    expect(result.payload.predictorDeadline).toBe(result.deadline);
  });

  test('accepts PickJson[] input and normalizes to canonical picks', async () => {
    const params = makeDefaultParams({ picks: TEST_PICKS_JSON });

    const result = await prepareAuctionRFQ(params);

    expect(result.canonicalPicks).toHaveLength(1);
    expect(result.canonicalPicks[0].conditionResolver).toBe(CONDITION_RESOLVER);
    expect(result.pickConfigId).toBe(
      computePickConfigId(canonicalizePicks(TEST_PICKS))
    );
  });

  test('multi-pick canonicalization orders deterministically', async () => {
    const pick1: Pick = {
      conditionResolver:
        '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as Address,
      conditionId:
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
      predictedOutcome: 0,
    };
    const pick2: Pick = {
      conditionResolver:
        '0x3333333333333333333333333333333333333333' as Address,
      conditionId:
        '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
      predictedOutcome: 1,
    };

    // Pass in non-canonical order
    const params1 = makeDefaultParams({ picks: [pick1, pick2] });
    const params2 = makeDefaultParams({
      picks: [pick2, pick1],
      predictor: params1.predictor,
      signIntent: params1.signIntent,
    });

    const result1 = await prepareAuctionRFQ(params1);
    const result2 = await prepareAuctionRFQ(params2);

    // Same pickConfigId regardless of input order
    expect(result1.pickConfigId).toBe(result2.pickConfigId);
    // Same canonical ordering
    expect(result1.canonicalPicks[0].conditionResolver).toBe(
      result2.canonicalPicks[0].conditionResolver
    );
  });

  test('uses custom deadlineSeconds', async () => {
    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        deadlineSeconds: 120,
      },
    });

    const result = await prepareAuctionRFQ(params);

    const nowSec = Math.floor(Date.now() / 1000);
    expect(result.deadline).toBeGreaterThanOrEqual(nowSec + 119);
    expect(result.deadline).toBeLessThanOrEqual(nowSec + 121);
  });

  test('includes sponsor fields when provided', async () => {
    const sponsor = '0x4444444444444444444444444444444444444444' as Address;
    const sponsorData = '0xdeadbeef' as Hex;

    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        predictorSponsor: sponsor,
        predictorSponsorData: sponsorData,
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.predictorSponsor).toBe(sponsor);
    expect(result.payload.predictorSponsorData).toBe(sponsorData);
  });

  test('defaults sponsor data to 0x when sponsor provided without data', async () => {
    const sponsor = '0x4444444444444444444444444444444444444444' as Address;

    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        predictorSponsor: sponsor,
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.predictorSponsor).toBe(sponsor);
    expect(result.payload.predictorSponsorData).toBe('0x');
  });

  test('includes refCode when provided', async () => {
    const refCode =
      '0x00000000000000000000000000000000000000000000000000000000deadbeef' as Hex;

    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        refCode,
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.refCode).toBe(refCode);
  });

  test('includes sessionKeyData when signing with session key', async () => {
    const sessionKeyData = JSON.stringify({
      approval: 'test-approval',
      typedData: 'test-typed-data',
    });

    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        sessionKeyData,
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.predictorSessionKeyData).toBe(sessionKeyData);
    expect(result.payload.intentSignature).toBeDefined();
  });

  test('omits sessionKeyData when skipIntentSigning is true', async () => {
    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        skipIntentSigning: true,
        sessionKeyData: 'should-not-appear',
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.intentSignature).toBeUndefined();
    expect(result.payload.predictorSessionKeyData).toBeUndefined();
  });

  test('skipIntentSigning produces payload without signature', async () => {
    const params = makeDefaultParams({
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        skipIntentSigning: true,
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.intentSignature).toBeUndefined();
    // Payload is still assembled
    expect(result.payload.predictor).toBeDefined();
    expect(result.payload.picks).toHaveLength(1);
  });

  test('throws when no verifying contract and signing is required', async () => {
    const params = makeDefaultParams({
      chainId: 99999, // no contract for this chain
      options: {
        // No explicit verifyingContract
      },
    });

    await expect(prepareAuctionRFQ(params)).rejects.toThrow(
      /No verifying contract for chainId=99999/
    );
  });

  test('self-validation catches bad signature from tampered signer', async () => {
    const account = makeTestAccount();
    const differentAccount = makeTestAccount();

    // Sign with a different account than the predictor
    const params = makeDefaultParams({
      predictor: account.address,
      signIntent: createTestSigner(differentAccount),
      options: {
        verifyingContract: VERIFYING_CONTRACT,
      },
    });

    await expect(prepareAuctionRFQ(params)).rejects.toThrow(/self-validation/);
  });

  test('skipSelfValidation bypasses validation even with bad signer', async () => {
    const account = makeTestAccount();
    const differentAccount = makeTestAccount();

    const params = makeDefaultParams({
      predictor: account.address,
      signIntent: createTestSigner(differentAccount),
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        skipSelfValidation: true,
      },
    });

    // Should not throw — validation is skipped
    const result = await prepareAuctionRFQ(params);
    expect(result.payload.intentSignature).toBeDefined();
  });

  test('accepts nonce as bigint', async () => {
    const params = makeDefaultParams({ nonce: 123456789n });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.predictorNonce).toBe(123456789);
  });

  test('signIntent receives correctly shaped typed data', async () => {
    const signIntentSpy = vi.fn(async (): Promise<Hex> => {
      return ('0x' + 'ab'.repeat(65)) as Hex;
    });

    const params = makeDefaultParams({
      signIntent: signIntentSpy,
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        skipSelfValidation: true, // skip validation since mock sig won't verify
      },
    });

    await prepareAuctionRFQ(params);

    expect(signIntentSpy).toHaveBeenCalledOnce();
    const typedData = signIntentSpy.mock.calls[0][0];

    // Domain
    expect(typedData.domain.name).toBe('PredictionMarketEscrow');
    expect(typedData.domain.version).toBe('1');
    expect(typedData.domain.chainId).toBe(CHAIN_ID);
    expect(typeof typedData.domain.chainId).toBe('number'); // not bigint
    expect(typedData.domain.verifyingContract).toBe(VERIFYING_CONTRACT);

    // Types & primaryType
    expect(typedData.primaryType).toBe('AuctionIntent');
    expect(typedData.types).toHaveProperty('AuctionIntent');

    // Message
    expect(typedData.message).toHaveProperty('predictor');
    expect(typedData.message).toHaveProperty('predictorCollateral');
    expect(typedData.message).toHaveProperty('predictorNonce');
    expect(typedData.message).toHaveProperty('predictorDeadline');
    expect(typedData.message).toHaveProperty('picks');
  });

  test('handles empty picks array', async () => {
    const params = makeDefaultParams({
      picks: [],
      options: {
        verifyingContract: VERIFYING_CONTRACT,
        skipSelfValidation: true, // empty picks would fail validation
      },
    });

    const result = await prepareAuctionRFQ(params);

    expect(result.payload.picks).toHaveLength(0);
    expect(result.canonicalPicks).toHaveLength(0);
  });
});

// ─── initiateAuction ─────────────────────────────────────────────────────────

describe('initiateAuction', () => {
  // These tests use a real ws server to exercise the full flow

  let serverPort: number;
  let wss: import('ws').WebSocketServer | null = null;

  async function startMockRelayer(
    handler: (msg: Record<string, unknown>, ws: import('ws').WebSocket) => void
  ): Promise<number> {
    const { WebSocketServer } = await import('ws');
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port: 0 }, () => {
        const addr = wss!.address();
        const port = typeof addr === 'object' ? addr.port : 0;
        resolve(port);
      });

      wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(String(raw));
            handler(msg, ws);
          } catch {
            /* ignore */
          }
        });
      });
    });
  }

  function stopMockRelayer() {
    if (wss) {
      wss.close();
      wss = null;
    }
  }

  // Clean up after each test
  afterEach(() => {
    stopMockRelayer();
  });

  test('end-to-end: sends auction.start and resolves with auctionId', async () => {
    const testAuctionId = 'test-auction-' + Date.now();

    serverPort = await startMockRelayer((msg, ws) => {
      if (msg.type === 'auction.start') {
        ws.send(
          JSON.stringify({
            type: 'auction.ack',
            id: msg.id,
            payload: { auctionId: testAuctionId },
          })
        );
      }
    });

    const account = makeTestAccount();
    const result = await initiateAuction({
      picks: TEST_PICKS,
      predictorCollateral: 1000000000000000000n,
      predictor: account.address,
      chainId: CHAIN_ID,
      nonce: 42,
      signIntent: createTestSigner(account),
      wsUrl: `ws://127.0.0.1:${serverPort}`,
      options: {
        verifyingContract: VERIFYING_CONTRACT,
      },
      timeoutMs: 5000,
    });

    expect(result.auctionId).toBe(testAuctionId);
    expect(result.payload).toBeDefined();
    expect(result.pickConfigId).toBeDefined();
    expect(result.canonicalPicks).toHaveLength(1);
    expect(result.deadline).toBeGreaterThan(0);
  });

  test('rejects when relayer returns error', async () => {
    serverPort = await startMockRelayer((msg, ws) => {
      if (msg.type === 'auction.start') {
        ws.send(
          JSON.stringify({
            type: 'auction.ack',
            id: msg.id,
            payload: { error: 'Invalid picks format' },
          })
        );
      }
    });

    const account = makeTestAccount();
    await expect(
      initiateAuction({
        picks: TEST_PICKS,
        predictorCollateral: 1000000000000000000n,
        predictor: account.address,
        chainId: CHAIN_ID,
        nonce: 42,
        signIntent: createTestSigner(account),
        wsUrl: `ws://127.0.0.1:${serverPort}`,
        options: {
          verifyingContract: VERIFYING_CONTRACT,
        },
        timeoutMs: 5000,
      })
    ).rejects.toThrow(/Invalid picks format/);
  });

  test('times out when relayer does not respond', async () => {
    // Server that never sends an ack
    serverPort = await startMockRelayer(() => {
      // intentionally no response
    });

    const account = makeTestAccount();
    await expect(
      initiateAuction({
        picks: TEST_PICKS,
        predictorCollateral: 1000000000000000000n,
        predictor: account.address,
        chainId: CHAIN_ID,
        nonce: 42,
        signIntent: createTestSigner(account),
        wsUrl: `ws://127.0.0.1:${serverPort}`,
        options: {
          verifyingContract: VERIFYING_CONTRACT,
        },
        timeoutMs: 500, // Short timeout for test speed
      })
    ).rejects.toThrow(/timed out/);
  });

  test('rejects on connection error (bad URL)', async () => {
    const account = makeTestAccount();
    await expect(
      initiateAuction({
        picks: TEST_PICKS,
        predictorCollateral: 1000000000000000000n,
        predictor: account.address,
        chainId: CHAIN_ID,
        nonce: 42,
        signIntent: createTestSigner(account),
        wsUrl: 'ws://127.0.0.1:1', // nothing listening
        options: {
          verifyingContract: VERIFYING_CONTRACT,
        },
        timeoutMs: 5000,
      })
    ).rejects.toThrow();
  });

  test('relayer receives the assembled payload', async () => {
    const receivedMessages: Record<string, unknown>[] = [];
    const testAuctionId = 'payload-check-' + Date.now();

    serverPort = await startMockRelayer((msg, ws) => {
      receivedMessages.push(msg);
      if (msg.type === 'auction.start') {
        ws.send(
          JSON.stringify({
            type: 'auction.ack',
            id: msg.id,
            payload: { auctionId: testAuctionId },
          })
        );
      }
    });

    const account = makeTestAccount();
    await initiateAuction({
      picks: TEST_PICKS,
      predictorCollateral: 2000000000000000000n,
      predictor: account.address,
      chainId: CHAIN_ID,
      nonce: 99,
      signIntent: createTestSigner(account),
      wsUrl: `ws://127.0.0.1:${serverPort}`,
      options: {
        verifyingContract: VERIFYING_CONTRACT,
      },
      timeoutMs: 5000,
    });

    // Verify the relayer received the correct payload
    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0];
    expect(msg.type).toBe('auction.start');

    const payload = msg.payload as Record<string, unknown>;
    expect(payload.predictor).toBe(account.address);
    expect(payload.predictorCollateral).toBe('2000000000000000000');
    expect(payload.predictorNonce).toBe(99);
    expect(payload.chainId).toBe(CHAIN_ID);
    expect(payload.intentSignature).toBeDefined();
    expect(Array.isArray(payload.picks)).toBe(true);
  });
});
