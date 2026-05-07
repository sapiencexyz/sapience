/**
 * Committed-Intent `commitment.submit` handler tests.
 *
 * Exercises accept / reject paths for:
 *   - missing signature
 *   - invalid signature
 *   - expired deadline
 *   - below min amountIn for sponsored commitments
 *   - happy path (accepted + broadcast + ack)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAddress, type Address, type Hex, type TypedDataDomain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ClientConnection, SubscriptionManager } from '../transport/types';
import type { SignedCommitmentJson } from '../committedIntentTypes';
import { commitmentToJson } from '@sapience/sdk/types/committedIntent';
import {
  COMMITMENT_EIP712_TYPES,
  buildCommitmentDomain,
} from '@sapience/sdk/auction/committedIntentEncoding';
import { handleCommitmentSubmit } from '../handlers/committedIntent';
import { _clearCommittedIntentRegistryForTesting } from '../committedIntentRegistry';
import { _clearExposureForTesting } from '../committedIntentExposure';

// ── helpers ───────────────────────────────────────────────────────────────
function mockClient(id = crypto.randomUUID()): ClientConnection {
  return {
    id,
    service: 'anonymous',
    variant: 'default',
    send: vi.fn(),
    close: vi.fn(),
    get isOpen() {
      return true;
    },
  };
}

function mockSubs(): SubscriptionManager {
  return {
    subscribe: vi.fn(() => true),
    unsubscribe: vi.fn(() => true),
    unsubscribeAll: vi.fn(() => 0),
    unsubscribeByPrefix: vi.fn(() => 0),
    broadcast: vi.fn(() => 0),
    broadcastRaw: vi.fn(() => 0),
    subscriberCount: vi.fn(() => 0),
  };
}

const EXEC = getAddress(
  '0x00000000000000000000000000000000000000C1'
) as Address;
const CHAIN_ID = 8453;

const PREDICTOR_PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const predictor = privateKeyToAccount(PREDICTOR_PK);
const INTRUDER_PK =
  '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;
const intruder = privateKeyToAccount(INTRUDER_PK);

function futureDeadline(offsetSec = 3600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSec);
}

function buildCommitment(
  overrides?: Partial<{
    predictor: Address;
    deadline: bigint;
    predictorWindowEnd: bigint;
    amountIn: bigint;
    minFillIn: bigint;
    minAmountOut: bigint;
    executorTip: bigint;
    nonce: bigint;
  }>
) {
  return {
    predictor: overrides?.predictor ?? predictor.address,
    predictorWindowEnd: overrides?.predictorWindowEnd ?? futureDeadline(60),
    deadline: overrides?.deadline ?? futureDeadline(120),
    pickConfigId:
      '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
    amountIn: overrides?.amountIn ?? 100n * 10n ** 18n,
    minFillIn: overrides?.minFillIn ?? 60n * 10n ** 18n,
    minAmountOut: overrides?.minAmountOut ?? 150n * 10n ** 18n,
    executorTip: overrides?.executorTip ?? 10n ** 18n,
    nonce: overrides?.nonce ?? 42n,
  };
}

async function signCommit(
  account: typeof predictor,
  c: ReturnType<typeof buildCommitment>
): Promise<Hex> {
  const domain: TypedDataDomain = buildCommitmentDomain(EXEC, CHAIN_ID);
  return account.signTypedData({
    domain,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    types: COMMITMENT_EIP712_TYPES as any,
    primaryType: 'Commitment',
    message: {
      predictor: c.predictor,
      predictorWindowEnd: c.predictorWindowEnd,
      deadline: c.deadline,
      pickConfigId: c.pickConfigId,
      amountIn: c.amountIn,
      minFillIn: c.minFillIn,
      minAmountOut: c.minAmountOut,
      executorTip: c.executorTip,
      nonce: c.nonce,
    },
  });
}

async function buildSigned(
  overrides?: Parameters<typeof buildCommitment>[0] & {
    signer?: typeof predictor;
    sponsored?: boolean;
  }
): Promise<SignedCommitmentJson> {
  const c = buildCommitment(overrides);
  const signer = overrides?.signer ?? predictor;
  const signature = await signCommit(signer, c);
  return {
    commitment: commitmentToJson(c),
    signature,
    chainId: CHAIN_ID,
    executorContract: EXEC,
    ...(overrides?.sponsored
      ? { predictorSponsor: '0x00000000000000000000000000000000000000f1' }
      : {}),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────
describe('handleCommitmentSubmit', () => {
  beforeEach(() => {
    _clearCommittedIntentRegistryForTesting();
    _clearExposureForTesting();
  });

  it('rejects missing signature', async () => {
    const c = buildCommitment();
    const payload = {
      commitment: commitmentToJson(c),
      // no signature
      chainId: CHAIN_ID,
      executorContract: EXEC,
    } as unknown as SignedCommitmentJson;

    const client = mockClient();
    const failed = await handleCommitmentSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commitment.ack',
        payload: expect.objectContaining({ error: 'invalid_payload' }),
      })
    );
  });

  it('rejects invalid signature (wrong signer)', async () => {
    const payload = await buildSigned({ signer: intruder });
    const client = mockClient();

    const failed = await handleCommitmentSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commitment.ack',
        payload: expect.objectContaining({ error: 'invalid_signature' }),
      })
    );
  });

  it('rejects expired commitment', async () => {
    const c = buildCommitment({
      deadline: BigInt(Math.floor(Date.now() / 1000) - 5),
      predictorWindowEnd: BigInt(Math.floor(Date.now() / 1000) - 10),
    });
    const signature = await signCommit(predictor, c);
    const payload: SignedCommitmentJson = {
      commitment: commitmentToJson(c),
      signature,
      chainId: CHAIN_ID,
      executorContract: EXEC,
    };

    const client = mockClient();
    const failed = await handleCommitmentSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commitment.ack',
        payload: expect.objectContaining({ error: 'commitment_expired' }),
      })
    );
  });

  it('rejects sponsored commit with amountIn below min', async () => {
    // default min = 1e18 = 1 WUSDe; pick 0.1
    const payload = await buildSigned({
      amountIn: 10n ** 17n,
      minFillIn: 10n ** 16n,
      deadline: futureDeadline(30), // also < sponsored max deadline
      predictorWindowEnd: futureDeadline(15),
      sponsored: true,
    });

    const client = mockClient();
    const failed = await handleCommitmentSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commitment.ack',
        payload: expect.objectContaining({
          error: 'amount_in_below_sponsored_min',
        }),
      })
    );
  });

  it('accepts a valid (non-sponsored) commit and broadcasts', async () => {
    const payload = await buildSigned();
    const client = mockClient();
    const subs = mockSubs();

    let expiryScheduled = false;
    const ctx = {
      allClients: () => [client],
      scheduleExpiry: () => {
        expiryScheduled = true;
      },
    };

    const failed = await handleCommitmentSubmit(
      client,
      payload,
      subs,
      ctx,
      'req-1'
    );

    expect(failed).toBe(false);
    // ack sent
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commitment.ack',
        payload: expect.objectContaining({
          commitmentHash: expect.stringMatching(/^0x[0-9a-fA-F]+$/),
          id: 'req-1',
        }),
      })
    );
    // subscribed caller
    expect(subs.subscribe).toHaveBeenCalledWith(
      expect.stringMatching(/^commitment:0x/),
      client
    );
    // created broadcast
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'commitment.created' })
    );
    // mirror fan-out
    expect(subs.broadcast).toHaveBeenCalledWith(
      'mirror:all',
      expect.objectContaining({ type: 'commitment.created' })
    );
    expect(expiryScheduled).toBe(true);
  });
});
