/**
 * Golden Hash Tests for escrowSigning.ts
 *
 * These tests ensure the TypeScript hash computations match the Solidity contract.
 * They catch:
 *   - Missing fields in hash computation (e.g. #1153 sponsor field)
 *   - Wrong encoding order or types
 *   - Accidental field removal during refactors
 *
 * The "golden values" are computed inline using viem's hashTypedData —
 * the same EIP-712 spec implementation that OpenZeppelin uses.
 * If the SDK functions drift from the spec, these tests break.
 */

import { describe, test, expect } from 'vitest';
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  keccak256,
  zeroAddress,
} from 'viem';

import {
  computePredictionHash,
  computePredictionHashFromPicks,
  computeBurnHash,
  buildMintApprovalTypedData,
  buildBurnApprovalTypedData,
  buildPredictorMintTypedData,
  buildCounterpartyMintTypedData,
  buildAuctionIntentTypedData,
  hashMintApproval,
  hashBurnApproval,
  getEscrowDomain,
  MINT_APPROVAL_TYPES,
  BURN_APPROVAL_TYPES,
} from './escrowSigning';

import {
  computePickConfigId,
  computePredictionId,
  canonicalizePicks,
} from './escrowEncoding';

import type { Pick } from '../types/escrow';

// ============================================================================
// Test Fixtures
// ============================================================================

const PREDICTOR = getAddress('0x1111111111111111111111111111111111111111');
const COUNTERPARTY = getAddress('0x2222222222222222222222222222222222222222');
const ESCROW_CONTRACT = getAddress('0x3333333333333333333333333333333333333333');
const SPONSOR = getAddress('0x4444444444444444444444444444444444444444');
const CHAIN_ID = 13374202; // Ethereal testnet

const RESOLVER_A = getAddress('0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa');
const RESOLVER_B = getAddress('0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB');

const PICKS: Pick[] = [
  {
    conditionResolver: RESOLVER_A,
    conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
    predictedOutcome: 1,
  },
];

const TWO_PICKS: Pick[] = [
  {
    conditionResolver: RESOLVER_A,
    conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
    predictedOutcome: 1,
  },
  {
    conditionResolver: RESOLVER_B,
    conditionId: ('0x' + 'cd'.repeat(32)) as Hex,
    predictedOutcome: 0,
  },
];

const PREDICTOR_COLLATERAL = 1000000n;
const COUNTERPARTY_COLLATERAL = 1000000n;
const NONCE = 42n;
const DEADLINE = 1700000000n;

// ============================================================================
// 1. predictionHash — field completeness
// ============================================================================

describe('computePredictionHash', () => {
  const pickConfigId = computePickConfigId(PICKS);

  test('includes all 7 fields in the hash', () => {
    // Compute the expected hash manually using the same encoding the contract uses:
    // keccak256(abi.encode(pickConfigId, predictorCollateral, counterpartyCollateral,
    //                      predictor, counterparty, predictorSponsor, predictorSponsorData))
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: 'bytes32' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'bytes' },
        ],
        [
          pickConfigId,
          PREDICTOR_COLLATERAL,
          COUNTERPARTY_COLLATERAL,
          PREDICTOR,
          COUNTERPARTY,
          zeroAddress,
          '0x',
        ]
      )
    );

    const actual = computePredictionHash(
      pickConfigId,
      PREDICTOR_COLLATERAL,
      COUNTERPARTY_COLLATERAL,
      PREDICTOR,
      COUNTERPARTY,
      zeroAddress,
      '0x'
    );

    expect(actual).toBe(expected);
  });

  test('changing predictorSponsor changes the hash (catches #1153)', () => {
    const withoutSponsor = computePredictionHash(
      pickConfigId,
      PREDICTOR_COLLATERAL,
      COUNTERPARTY_COLLATERAL,
      PREDICTOR,
      COUNTERPARTY,
      zeroAddress,
      '0x'
    );

    const withSponsor = computePredictionHash(
      pickConfigId,
      PREDICTOR_COLLATERAL,
      COUNTERPARTY_COLLATERAL,
      PREDICTOR,
      COUNTERPARTY,
      SPONSOR,
      '0x'
    );

    expect(withoutSponsor).not.toBe(withSponsor);
  });

  test('changing predictorSponsorData changes the hash', () => {
    const withoutData = computePredictionHash(
      pickConfigId,
      PREDICTOR_COLLATERAL,
      COUNTERPARTY_COLLATERAL,
      PREDICTOR,
      COUNTERPARTY,
      SPONSOR,
      '0x'
    );

    const withData = computePredictionHash(
      pickConfigId,
      PREDICTOR_COLLATERAL,
      COUNTERPARTY_COLLATERAL,
      PREDICTOR,
      COUNTERPARTY,
      SPONSOR,
      '0x1234'
    );

    expect(withoutData).not.toBe(withData);
  });

  test('changing predictor changes the hash', () => {
    const hash1 = computePredictionHash(pickConfigId, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL, PREDICTOR, COUNTERPARTY, zeroAddress, '0x');
    const hash2 = computePredictionHash(pickConfigId, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL, COUNTERPARTY, COUNTERPARTY, zeroAddress, '0x');
    expect(hash1).not.toBe(hash2);
  });

  test('changing counterparty changes the hash', () => {
    const hash1 = computePredictionHash(pickConfigId, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL, PREDICTOR, COUNTERPARTY, zeroAddress, '0x');
    const hash2 = computePredictionHash(pickConfigId, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL, PREDICTOR, PREDICTOR, zeroAddress, '0x');
    expect(hash1).not.toBe(hash2);
  });

  test('changing collateral amounts changes the hash', () => {
    const hash1 = computePredictionHash(pickConfigId, 1000000n, 1000000n, PREDICTOR, COUNTERPARTY, zeroAddress, '0x');
    const hash2 = computePredictionHash(pickConfigId, 2000000n, 1000000n, PREDICTOR, COUNTERPARTY, zeroAddress, '0x');
    const hash3 = computePredictionHash(pickConfigId, 1000000n, 2000000n, PREDICTOR, COUNTERPARTY, zeroAddress, '0x');
    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash2).not.toBe(hash3);
  });

  test('computePredictionHashFromPicks matches computePredictionHash', () => {
    const fromPicks = computePredictionHashFromPicks(
      PICKS, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL,
      PREDICTOR, COUNTERPARTY, zeroAddress, '0x'
    );
    const fromConfigId = computePredictionHash(
      pickConfigId, PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL,
      PREDICTOR, COUNTERPARTY, zeroAddress, '0x'
    );
    expect(fromPicks).toBe(fromConfigId);
  });
});

// ============================================================================
// 2. pickConfigId — canonical ordering
// ============================================================================

describe('computePickConfigId', () => {
  test('pick order matters (non-canonical order gives different configId)', () => {
    const forward = computePickConfigId(TWO_PICKS);
    const reversed = computePickConfigId([...TWO_PICKS].reverse());
    // Order matters! That's why canonicalizePicks exists
    expect(forward).not.toBe(reversed);
  });

  test('canonicalized picks always produce the same configId regardless of input order', () => {
    const canonical1 = computePickConfigId(canonicalizePicks(TWO_PICKS));
    const canonical2 = computePickConfigId(canonicalizePicks([...TWO_PICKS].reverse()));
    expect(canonical1).toBe(canonical2);
  });
});

// ============================================================================
// 3. burnHash — field completeness
// ============================================================================

describe('computeBurnHash', () => {
  const pickConfigId = computePickConfigId(PICKS);

  test('matches manual abi.encode computation', () => {
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: 'bytes32' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'address' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
        ],
        [pickConfigId, 500000n, 500000n, PREDICTOR, COUNTERPARTY, 1000000n, 0n]
      )
    );

    const actual = computeBurnHash(
      pickConfigId, 500000n, 500000n, PREDICTOR, COUNTERPARTY, 1000000n, 0n
    );

    expect(actual).toBe(expected);
  });

  test('changing any field changes the hash', () => {
    const base = computeBurnHash(pickConfigId, 500000n, 500000n, PREDICTOR, COUNTERPARTY, 1000000n, 0n);

    // Different token amounts
    expect(computeBurnHash(pickConfigId, 600000n, 500000n, PREDICTOR, COUNTERPARTY, 1000000n, 0n)).not.toBe(base);
    // Different holders
    expect(computeBurnHash(pickConfigId, 500000n, 500000n, COUNTERPARTY, COUNTERPARTY, 1000000n, 0n)).not.toBe(base);
    // Different payouts
    expect(computeBurnHash(pickConfigId, 500000n, 500000n, PREDICTOR, COUNTERPARTY, 500000n, 500000n)).not.toBe(base);
  });
});

// ============================================================================
// 4. MintApproval EIP-712 typed data — structure & signer correctness
// ============================================================================

describe('buildMintApprovalTypedData', () => {
  const predictionHash = computePredictionHash(
    computePickConfigId(PICKS), PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL,
    PREDICTOR, COUNTERPARTY, zeroAddress, '0x'
  );

  test('domain matches contract config', () => {
    const typed = buildMintApprovalTypedData({
      predictionHash,
      signer: PREDICTOR,
      collateral: PREDICTOR_COLLATERAL,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.domain.name).toBe('PredictionMarketEscrow');
    expect(typed.domain.version).toBe('1');
    expect(typed.domain.verifyingContract).toBe(ESCROW_CONTRACT);
    expect(typed.domain.chainId).toBe(BigInt(CHAIN_ID));
  });

  test('message contains all required fields', () => {
    const typed = buildMintApprovalTypedData({
      predictionHash,
      signer: PREDICTOR,
      collateral: PREDICTOR_COLLATERAL,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.predictionHash).toBe(predictionHash);
    expect(typed.message.signer).toBe(PREDICTOR);
    expect(typed.message.collateral).toBe(PREDICTOR_COLLATERAL);
    expect(typed.message.nonce).toBe(NONCE);
    expect(typed.message.deadline).toBe(DEADLINE);
  });

  test('type fields match MINT_APPROVAL_TYPEHASH structure', () => {
    // These must match SignatureValidator.MINT_APPROVAL_TYPEHASH:
    // keccak256("MintApproval(bytes32 predictionHash,address signer,uint256 collateral,uint256 nonce,uint256 deadline)")
    const fieldNames = MINT_APPROVAL_TYPES.MintApproval.map(f => f.name);
    expect(fieldNames).toEqual(['predictionHash', 'signer', 'collateral', 'nonce', 'deadline']);

    const fieldTypes = MINT_APPROVAL_TYPES.MintApproval.map(f => f.type);
    expect(fieldTypes).toEqual(['bytes32', 'address', 'uint256', 'uint256', 'uint256']);
  });
});

// ============================================================================
// 5. Signer correctness — predictor vs counterparty
// ============================================================================

describe('signer assignment', () => {
  test('predictor mint uses predictor as signer', () => {
    const typed = buildPredictorMintTypedData({
      picks: PICKS,
      predictorCollateral: PREDICTOR_COLLATERAL,
      counterpartyCollateral: COUNTERPARTY_COLLATERAL,
      predictor: PREDICTOR,
      counterparty: COUNTERPARTY,
      predictorNonce: NONCE,
      predictorDeadline: DEADLINE,
      predictorSponsor: zeroAddress,
      predictorSponsorData: '0x',
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.signer).toBe(PREDICTOR);
    expect(typed.message.collateral).toBe(PREDICTOR_COLLATERAL);
  });

  test('counterparty mint uses counterparty as signer (catches #117)', () => {
    const typed = buildCounterpartyMintTypedData({
      picks: PICKS,
      predictorCollateral: PREDICTOR_COLLATERAL,
      counterpartyCollateral: COUNTERPARTY_COLLATERAL,
      predictor: PREDICTOR,
      counterparty: COUNTERPARTY,
      counterpartyNonce: NONCE,
      counterpartyDeadline: DEADLINE,
      predictorSponsor: zeroAddress,
      predictorSponsorData: '0x',
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.signer).toBe(COUNTERPARTY);
    expect(typed.message.collateral).toBe(COUNTERPARTY_COLLATERAL);
  });

  test('predictor and counterparty get the same predictionHash', () => {
    const predictorTyped = buildPredictorMintTypedData({
      picks: PICKS,
      predictorCollateral: PREDICTOR_COLLATERAL,
      counterpartyCollateral: COUNTERPARTY_COLLATERAL,
      predictor: PREDICTOR,
      counterparty: COUNTERPARTY,
      predictorNonce: NONCE,
      predictorDeadline: DEADLINE,
      predictorSponsor: zeroAddress,
      predictorSponsorData: '0x',
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    const counterpartyTyped = buildCounterpartyMintTypedData({
      picks: PICKS,
      predictorCollateral: PREDICTOR_COLLATERAL,
      counterpartyCollateral: COUNTERPARTY_COLLATERAL,
      predictor: PREDICTOR,
      counterparty: COUNTERPARTY,
      counterpartyNonce: NONCE,
      counterpartyDeadline: DEADLINE,
      predictorSponsor: zeroAddress,
      predictorSponsorData: '0x',
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    // Both sides must agree on the predictionHash
    expect(predictorTyped.message.predictionHash).toBe(counterpartyTyped.message.predictionHash);

    // But they sign with different signers
    expect(predictorTyped.message.signer).not.toBe(counterpartyTyped.message.signer);
  });
});

// ============================================================================
// 6. hashMintApproval — full EIP-712 hash stability
// ============================================================================

describe('hashMintApproval', () => {
  const predictionHash = computePredictionHash(
    computePickConfigId(PICKS), PREDICTOR_COLLATERAL, COUNTERPARTY_COLLATERAL,
    PREDICTOR, COUNTERPARTY, zeroAddress, '0x'
  );

  const params = {
    predictionHash,
    signer: PREDICTOR,
    collateral: PREDICTOR_COLLATERAL,
    nonce: NONCE,
    deadline: DEADLINE,
    verifyingContract: ESCROW_CONTRACT,
    chainId: CHAIN_ID,
  };

  test('matches viem hashTypedData computation', () => {
    const fromFunction = hashMintApproval(params);
    const fromViem = hashTypedData({
      domain: getEscrowDomain(ESCROW_CONTRACT, CHAIN_ID),
      types: MINT_APPROVAL_TYPES,
      primaryType: 'MintApproval',
      message: {
        predictionHash,
        signer: PREDICTOR,
        collateral: PREDICTOR_COLLATERAL,
        nonce: NONCE,
        deadline: DEADLINE,
      },
    });

    expect(fromFunction).toBe(fromViem);
  });

  test('different chain ID produces different hash', () => {
    const hash1 = hashMintApproval(params);
    const hash2 = hashMintApproval({ ...params, chainId: 42161 });
    expect(hash1).not.toBe(hash2);
  });

  test('different verifying contract produces different hash', () => {
    const hash1 = hashMintApproval(params);
    const hash2 = hashMintApproval({
      ...params,
      verifyingContract: getAddress('0x5555555555555555555555555555555555555555'),
    });
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// 7. BurnApproval — structure validation
// ============================================================================

describe('BurnApproval', () => {
  test('type fields match BURN_APPROVAL_TYPEHASH structure', () => {
    const fieldNames = BURN_APPROVAL_TYPES.BurnApproval.map(f => f.name);
    expect(fieldNames).toEqual(['burnHash', 'signer', 'tokenAmount', 'payout', 'nonce', 'deadline']);

    const fieldTypes = BURN_APPROVAL_TYPES.BurnApproval.map(f => f.type);
    expect(fieldTypes).toEqual(['bytes32', 'address', 'uint256', 'uint256', 'uint256', 'uint256']);
  });

  test('hashBurnApproval matches viem hashTypedData', () => {
    const pickConfigId = computePickConfigId(PICKS);
    const burnHash = computeBurnHash(pickConfigId, 500000n, 500000n, PREDICTOR, COUNTERPARTY, 1000000n, 0n);

    const params = {
      burnHash,
      signer: PREDICTOR,
      tokenAmount: 500000n,
      payout: 1000000n,
      nonce: NONCE,
      deadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    };

    const fromFunction = hashBurnApproval(params);
    const fromViem = hashTypedData({
      domain: getEscrowDomain(ESCROW_CONTRACT, CHAIN_ID),
      types: BURN_APPROVAL_TYPES,
      primaryType: 'BurnApproval',
      message: {
        burnHash,
        signer: PREDICTOR,
        tokenAmount: 500000n,
        payout: 1000000n,
        nonce: NONCE,
        deadline: DEADLINE,
      },
    });

    expect(fromFunction).toBe(fromViem);
  });
});

// ============================================================================
// 8. AuctionIntent — relayer-side auth
// ============================================================================

describe('buildAuctionIntentTypedData', () => {
  test('message contains all required fields', () => {
    const typed = buildAuctionIntentTypedData({
      picks: PICKS,
      predictor: PREDICTOR,
      predictorCollateral: PREDICTOR_COLLATERAL,
      predictorNonce: NONCE,
      predictorDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.primaryType).toBe('AuctionIntent');
    expect(typed.message.predictor).toBe(PREDICTOR);
    expect(typed.message.predictorCollateral).toBe(PREDICTOR_COLLATERAL);
    expect(typed.message.predictorNonce).toBe(NONCE);
    expect(typed.message.predictorDeadline).toBe(DEADLINE);
    expect(typed.message.picks).toHaveLength(1);
    expect(typed.message.picks[0].predictedOutcome).toBe(1);
  });

  test('picks are properly structured in the message', () => {
    const typed = buildAuctionIntentTypedData({
      picks: TWO_PICKS,
      predictor: PREDICTOR,
      predictorCollateral: PREDICTOR_COLLATERAL,
      predictorNonce: NONCE,
      predictorDeadline: DEADLINE,
      verifyingContract: ESCROW_CONTRACT,
      chainId: CHAIN_ID,
    });

    expect(typed.message.picks).toHaveLength(2);
    expect(typed.message.picks[0].conditionResolver).toBe(TWO_PICKS[0].conditionResolver);
    expect(typed.message.picks[1].conditionResolver).toBe(TWO_PICKS[1].conditionResolver);
  });
});

// ============================================================================
// 9. predictionId — uniqueness per mint
// ============================================================================

describe('computePredictionId', () => {
  const pickConfigId = computePickConfigId(PICKS);

  test('different nonces produce different predictionId', () => {
    const id1 = computePredictionId(pickConfigId, PREDICTOR, COUNTERPARTY, 1n, 2n);
    const id2 = computePredictionId(pickConfigId, PREDICTOR, COUNTERPARTY, 3n, 2n);
    expect(id1).not.toBe(id2);
  });
});
