/**
 * Committed-Intent signing round-trips: ECDSA sign → verify.
 *
 * Covers the ECDSA branch of the shared `session/eip712Verify.ts` helper
 * against a deterministic `privateKeyToAccount`. ERC-1271 is not exercised
 * here (needs an RPC-backed smart-account); that branch is covered by
 * integration tests in a later phase.
 */

import { describe, test, expect } from 'vitest';
import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  signCommitment,
  signQuote,
  verifyCommitmentSignature,
  verifyQuoteSignature,
  hashCommitment,
  hashQuote,
} from '../auction/committedIntentSigning';
import type { Commitment, Quote } from '../types/committedIntent';

const EXEC = getAddress(
  '0x00000000000000000000000000000000000000C1'
) as Address;
const CHAIN_ID = 8453;

const PREDICTOR_PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const COUNTERPARTY_PK =
  '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
const INTRUDER_PK =
  '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;

const predictor = privateKeyToAccount(PREDICTOR_PK);
const counterparty = privateKeyToAccount(COUNTERPARTY_PK);
const intruder = privateKeyToAccount(INTRUDER_PK);

const commitment: Commitment = {
  predictor: predictor.address,
  predictorWindowEnd: 1800000060n,
  deadline: 1800000120n,
  pickConfigId:
    '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
  amountIn: 100_000000000000000000n,
  minFillIn: 60_000000000000000000n,
  minAmountOut: 150_000000000000000000n,
  executorTip: 1_000000000000000000n,
  nonce: 42n,
};

const quote: Quote = {
  counterparty: counterparty.address,
  deadline: 1800000100n,
  commitmentHash: hashCommitment(commitment, EXEC, CHAIN_ID),
  maxIn: 100_000000000000000000n,
  amountOut: 200_000000000000000000n,
  nonce: 7n,
};

describe('signCommitment / verifyCommitmentSignature', () => {
  test('valid signature recovers predictor', async () => {
    const sig = await signCommitment(
      (typedData) =>
        predictor.signTypedData({
          domain: typedData.domain,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          types: typedData.types as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          primaryType: typedData.primaryType as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          message: typedData.message as any,
        }),
      commitment,
      EXEC,
      CHAIN_ID
    );

    const result = await verifyCommitmentSignature({
      commitment,
      signature: sig,
      exec: EXEC,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(true);
    expect(result.recoveredAddress?.toLowerCase()).toBe(
      predictor.address.toLowerCase()
    );
  });

  test('wrong signer is rejected', async () => {
    // Intruder signs a commitment that claims `predictor` as signer.
    const sig = await intruder.signTypedData({
      domain: {
        name: 'SapienceCommittedIntent',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: EXEC,
      },
      types: {
        Commitment: [
          { name: 'predictor', type: 'address' },
          { name: 'predictorWindowEnd', type: 'uint64' },
          { name: 'deadline', type: 'uint64' },
          { name: 'pickConfigId', type: 'bytes32' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minFillIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'executorTip', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'Commitment',
      message: {
        predictor: commitment.predictor,
        predictorWindowEnd: commitment.predictorWindowEnd,
        deadline: commitment.deadline,
        pickConfigId: commitment.pickConfigId,
        amountIn: commitment.amountIn,
        minFillIn: commitment.minFillIn,
        minAmountOut: commitment.minAmountOut,
        executorTip: commitment.executorTip,
        nonce: commitment.nonce,
      },
    });

    const result = await verifyCommitmentSignature({
      commitment,
      signature: sig,
      exec: EXEC,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(false);
    // recoveredAddress should be the intruder (recovery succeeded; it just didn't match)
    expect(result.recoveredAddress?.toLowerCase()).toBe(
      intruder.address.toLowerCase()
    );
  });

  test('mangled signature is rejected', async () => {
    const result = await verifyCommitmentSignature({
      commitment,
      signature: ('0x' + 'de'.repeat(65)) as Hex,
      exec: EXEC,
      chainId: CHAIN_ID,
    });
    expect(result.valid).toBe(false);
  });
});

describe('signQuote / verifyQuoteSignature', () => {
  test('valid signature recovers counterparty', async () => {
    const sig = await signQuote(
      (typedData) =>
        counterparty.signTypedData({
          domain: typedData.domain,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          types: typedData.types as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          primaryType: typedData.primaryType as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          message: typedData.message as any,
        }),
      quote,
      EXEC,
      CHAIN_ID
    );

    const result = await verifyQuoteSignature({
      quote,
      signature: sig,
      exec: EXEC,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(true);
    expect(result.recoveredAddress?.toLowerCase()).toBe(
      counterparty.address.toLowerCase()
    );
  });

  test('wrong signer is rejected', async () => {
    // Sign the quote's typed data with the intruder but claim counterparty
    // address; verification should fail.
    const quoteWithIntruderClaim: Quote = {
      ...quote,
      counterparty: intruder.address,
    };
    const sig = await counterparty.signTypedData({
      domain: {
        name: 'SapienceCommittedIntent',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: EXEC,
      },
      types: {
        Quote: [
          { name: 'counterparty', type: 'address' },
          { name: 'deadline', type: 'uint64' },
          { name: 'commitmentHash', type: 'bytes32' },
          { name: 'maxIn', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'Quote',
      message: {
        counterparty: quoteWithIntruderClaim.counterparty,
        deadline: quoteWithIntruderClaim.deadline,
        commitmentHash: quoteWithIntruderClaim.commitmentHash,
        maxIn: quoteWithIntruderClaim.maxIn,
        amountOut: quoteWithIntruderClaim.amountOut,
        nonce: quoteWithIntruderClaim.nonce,
      },
    });

    const result = await verifyQuoteSignature({
      quote: quoteWithIntruderClaim,
      signature: sig,
      exec: EXEC,
      chainId: CHAIN_ID,
    });

    expect(result.valid).toBe(false);
  });

  test('hashQuote is deterministic', () => {
    const h1 = hashQuote(quote, EXEC, CHAIN_ID);
    const h2 = hashQuote({ ...quote }, EXEC, CHAIN_ID);
    expect(h1).toBe(h2);
  });
});
