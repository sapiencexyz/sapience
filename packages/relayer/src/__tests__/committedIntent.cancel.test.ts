/**
 * Committed-Intent `quote.cancel` handler tests.
 *
 * Exercises the `minNonce` bulk cancel semantics (PRD-001 §4.5.5b): after
 * a signed `QuoteCancel(counterparty, minNonce, chainId, executorContract)`
 * arrives, every live quote from that counterparty with `nonce < minNonce`
 * is removed from the registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAddress, type Address, type Hex, type TypedDataDomain } from 'viem';
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
  handleQuoteCancel,
} from '../handlers/committedIntent';
import {
  _clearCommittedIntentRegistryForTesting,
  getQuotes,
} from '../committedIntentRegistry';
import { _clearExposureForTesting } from '../committedIntentExposure';

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

const predictor = privateKeyToAccount(
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
);
const cp = privateKeyToAccount(
  '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
);

function future(offsetSec: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSec);
}

async function seedCommitment(): Promise<{ hash: string; deadline: bigint }> {
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
    nonce: 77n,
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
    picks: [],
  };
  await handleCommitmentSubmit(mockClient(), signed, mockSubs());
  return {
    hash: computeCommitmentHash(c, EXEC, CHAIN_ID),
    deadline: c.deadline,
  };
}

async function seedQuote(
  commitmentHash: string,
  deadline: bigint,
  nonce: bigint
): Promise<SignedQuoteJson> {
  const q = {
    counterparty: cp.address,
    deadline: deadline - 10n,
    commitmentHash: commitmentHash as Hex,
    maxIn: 100n * 10n ** 18n,
    amountOut: 200n * 10n ** 18n,
    nonce,
  };
  const signature = await cp.signTypedData({
    domain: buildCommitmentDomain(EXEC, CHAIN_ID),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    types: QUOTE_EIP712_TYPES as any,
    primaryType: 'Quote',
    message: { ...q },
  });
  const signed: SignedQuoteJson = {
    quote: quoteToJson(q),
    signature,
    receivedAt: new Date().toISOString(),
  };
  await handleQuoteSubmit(mockClient(), signed, mockSubs(), {
    allClients: () => [],
    resolveVaultBalance: () => 10_000n * 10n ** 18n,
  });
  return signed;
}

async function signQuoteCancel(
  counterparty: Address,
  minNonce: bigint,
  chainId: number,
  executorContract: Address,
  signer: typeof cp
): Promise<Hex> {
  const domain: TypedDataDomain = {
    name: 'SapienceCommittedIntent',
    version: '1',
    chainId,
    verifyingContract: executorContract,
  };
  return signer.signTypedData({
    domain,
    types: {
      QuoteCancel: [
        { name: 'counterparty', type: 'address' },
        { name: 'minNonce', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
        { name: 'executorContract', type: 'address' },
      ],
    },
    primaryType: 'QuoteCancel',
    message: {
      counterparty,
      minNonce,
      chainId: BigInt(chainId),
      executorContract,
    },
  });
}

describe('handleQuoteCancel', () => {
  beforeEach(() => {
    _clearCommittedIntentRegistryForTesting();
    _clearExposureForTesting();
  });

  it('invalidates all quotes below minNonce for the counterparty', async () => {
    const { hash, deadline } = await seedCommitment();
    await seedQuote(hash, deadline, 1n);
    await seedQuote(hash, deadline, 2n);
    await seedQuote(hash, deadline, 5n);

    expect(getQuotes(hash)).toHaveLength(3);

    const signature = await signQuoteCancel(
      cp.address,
      4n, // cancel <4 → keeps nonce 5
      CHAIN_ID,
      EXEC,
      cp
    );

    const client = mockClient();
    const failed = await handleQuoteCancel(
      client,
      {
        counterparty: cp.address,
        minNonce: '4',
        signature,
        chainId: CHAIN_ID,
        executorContract: EXEC,
      } as unknown as Parameters<typeof handleQuoteCancel>[1],
      mockSubs()
    );

    expect(failed).toBe(false);
    const surviving = getQuotes(hash);
    expect(surviving).toHaveLength(1);
    expect(surviving[0].quote.nonce).toBe('5');
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({ cancelled: 2 }),
      })
    );
  });

  it('rejects when signature is not by the claimed counterparty', async () => {
    const intruder = privateKeyToAccount(
      '0x5555555555555555555555555555555555555555555555555555555555555555' as Hex
    );
    const signature = await signQuoteCancel(
      cp.address, // claim `cp`
      9n,
      CHAIN_ID,
      EXEC,
      intruder // signed by someone else
    );

    const client = mockClient();
    const failed = await handleQuoteCancel(
      client,
      {
        counterparty: cp.address,
        minNonce: '9',
        signature,
        chainId: CHAIN_ID,
        executorContract: EXEC,
      } as unknown as Parameters<typeof handleQuoteCancel>[1],
      mockSubs()
    );

    expect(failed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quote.ack',
        payload: expect.objectContaining({ error: 'invalid_signature' }),
      })
    );
  });
});
