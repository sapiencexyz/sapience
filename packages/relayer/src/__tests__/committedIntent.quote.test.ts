/**
 * Committed-Intent `quote.submit` handler tests.
 *
 * Exercises:
 *   - bad signature
 *   - deadline beyond commitment deadline
 *   - unknown commitmentHash
 *   - happy path (accepted + broadcast + exposure bumped)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ClientConnection, SubscriptionManager } from '../transport/types';
import type {
  SignedCommitmentJson,
  SignedQuoteJson,
} from '../committedIntentTypes';
import {
  commitmentToJson,
  quoteToJson,
} from '@sapience/sdk/types/committedIntent';
import {
  COMMITMENT_EIP712_TYPES,
  QUOTE_EIP712_TYPES,
  buildCommitmentDomain,
  computeCommitmentHash,
} from '@sapience/sdk/auction/committedIntentEncoding';
import {
  handleCommitmentSubmit,
  handleQuoteSubmit,
} from '../handlers/committedIntent';
import { _clearCommittedIntentRegistryForTesting } from '../committedIntentRegistry';
import {
  _clearExposureForTesting,
  getExposure,
} from '../committedIntentExposure';

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

const predictor = privateKeyToAccount(
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
);
const cp = privateKeyToAccount(
  '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
);
const intruder = privateKeyToAccount(
  '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex
);

function future(offsetSec: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSec);
}

async function seedCommitment(): Promise<{
  signed: SignedCommitmentJson;
  hash: string;
  deadline: bigint;
}> {
  const c = {
    predictor: predictor.address,
    predictorWindowEnd: future(60),
    deadline: future(300),
    pickConfigId:
      '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex,
    amountIn: 100n * 10n ** 18n,
    minFillIn: 60n * 10n ** 18n,
    minAmountOut: 150n * 10n ** 18n,
    executorTip: 10n ** 18n,
    nonce: 99n,
  };
  const signature = await predictor.signTypedData({
    domain: buildCommitmentDomain(EXEC, CHAIN_ID),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    types: COMMITMENT_EIP712_TYPES as any,
    primaryType: 'Commitment',
    message: { ...c },
  });
  const signed: SignedCommitmentJson = {
    commitment: commitmentToJson(c),
    signature,
    chainId: CHAIN_ID,
    executorContract: EXEC,
  };

  const hash = computeCommitmentHash(c, EXEC, CHAIN_ID);

  await handleCommitmentSubmit(mockClient(), signed, mockSubs());
  return { signed, hash, deadline: c.deadline };
}

async function buildSignedQuote(opts: {
  commitmentHash: string;
  deadline: bigint;
  signer?: typeof cp;
  maxIn?: bigint;
  amountOut?: bigint;
  nonce?: bigint;
  counterparty?: Address;
}): Promise<SignedQuoteJson> {
  const q = {
    counterparty: opts.counterparty ?? cp.address,
    deadline: opts.deadline,
    commitmentHash: opts.commitmentHash as Hex,
    maxIn: opts.maxIn ?? 100n * 10n ** 18n,
    amountOut: opts.amountOut ?? 200n * 10n ** 18n,
    nonce: opts.nonce ?? 7n,
  };
  const signer = opts.signer ?? cp;
  const signature = await signer.signTypedData({
    domain: buildCommitmentDomain(EXEC, CHAIN_ID),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    types: QUOTE_EIP712_TYPES as any,
    primaryType: 'Quote',
    message: { ...q },
  });
  return {
    quote: quoteToJson(q),
    signature,
    receivedAt: new Date().toISOString(),
  };
}

describe('handleQuoteSubmit', () => {
  beforeEach(() => {
    _clearCommittedIntentRegistryForTesting();
    _clearExposureForTesting();
  });

  it('rejects quote with unknown commitmentHash', async () => {
    const payload = await buildSignedQuote({
      commitmentHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      deadline: future(120),
    });
    const client = mockClient();

    const failed = await handleQuoteSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({ error: 'unknown_commitment' }),
      })
    );
  });

  it('rejects quote whose deadline > commitment.deadline', async () => {
    const { hash, deadline } = await seedCommitment();
    const payload = await buildSignedQuote({
      commitmentHash: hash,
      deadline: deadline + 3600n, // beyond commitment
    });
    const client = mockClient();

    const failed = await handleQuoteSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({
          error: 'quote_deadline_beyond_commitment',
        }),
      })
    );
  });

  it('rejects quote with bad signature (wrong signer)', async () => {
    const { hash, deadline } = await seedCommitment();
    const payload = await buildSignedQuote({
      commitmentHash: hash,
      deadline: deadline - 10n,
      signer: intruder, // signs but claims `cp` as counterparty
    });
    const client = mockClient();

    const failed = await handleQuoteSubmit(client, payload, mockSubs());

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({ error: 'invalid_signature' }),
      })
    );
  });

  it('accepts a valid quote and broadcasts to subscribers', async () => {
    const { hash, deadline } = await seedCommitment();
    // Use a very high vault balance so the exposure gate passes.
    const ctx = {
      allClients: () => [],
      resolveVaultBalance: () => 10_000n * 10n ** 18n,
    };
    const payload = await buildSignedQuote({
      commitmentHash: hash,
      deadline: deadline - 10n,
    });
    const client = mockClient();
    const subs = mockSubs();

    const failed = await handleQuoteSubmit(
      client,
      payload,
      subs,
      ctx,
      'req-42'
    );

    expect(failed).toBe(false);
    // ack includes quoteHash
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({
          quoteHash: expect.stringMatching(/^0x[0-9a-fA-F]+$/),
          id: 'req-42',
        }),
      })
    );
    // broadcast on commitment topic + mirror
    expect(subs.broadcast).toHaveBeenCalledWith(
      `commitment:${hash}`,
      expect.objectContaining({ type: 'commitment.quote' })
    );
    expect(subs.broadcast).toHaveBeenCalledWith(
      'mirror:all',
      expect.objectContaining({ type: 'commitment.quote' })
    );
    // exposure bumped
    expect(getExposure(cp.address)).toBe(200n * 10n ** 18n);
  });
});
