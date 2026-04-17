/**
 * Hand-rolled ABI for `CommittedIntentExecutor`.
 *
 * Source of truth for the SDK until Fase 1's cannon/forge codegen lands.
 * Contains only the surface the SDK uses to build calldata and read the
 * canonical EIP-712 views:
 *
 *   - `commit(Commitment, bytes)`
 *   - `execute(Commitment, bytes, Pick[], Quote[], bytes[], address)`
 *   - `expire(Commitment, bytes)`
 *   - `commitmentHash(Commitment)`, `quoteHash(Quote)`,
 *     `DOMAIN_SEPARATOR()`, `settled(bytes32)`
 *
 * Field order MUST match `ICommittedIntent.sol` exactly (see spec 0.1 §1).
 */

import type { Abi } from 'abitype';

const COMMITMENT_TUPLE = {
  type: 'tuple',
  name: 'c',
  components: [
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
} as const;

const QUOTE_TUPLE = {
  type: 'tuple',
  name: 'q',
  components: [
    { name: 'counterparty', type: 'address' },
    { name: 'deadline', type: 'uint64' },
    { name: 'commitmentHash', type: 'bytes32' },
    { name: 'maxIn', type: 'uint256' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

const PICK_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'conditionResolver', type: 'address' },
    { name: 'conditionId', type: 'bytes' },
    { name: 'predictedOutcome', type: 'uint8' },
  ],
} as const;

export const committedIntentExecutorAbi = [
  // -------- Write entrypoints --------
  {
    type: 'function',
    name: 'commit',
    stateMutability: 'nonpayable',
    inputs: [COMMITMENT_TUPLE, { name: 'predictorSig', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      COMMITMENT_TUPLE,
      { name: 'predictorSig', type: 'bytes' },
      { ...PICK_TUPLE, name: 'picks', type: 'tuple[]' },
      { ...QUOTE_TUPLE, name: 'quotes', type: 'tuple[]' },
      { name: 'counterpartySigs', type: 'bytes[]' },
      { name: 'tipRecipient', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'expire',
    stateMutability: 'nonpayable',
    inputs: [COMMITMENT_TUPLE, { name: 'predictorSig', type: 'bytes' }],
    outputs: [],
  },

  // -------- View / pure getters --------
  {
    type: 'function',
    name: 'commitmentHash',
    stateMutability: 'view',
    inputs: [COMMITMENT_TUPLE],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'quoteHash',
    stateMutability: 'view',
    inputs: [QUOTE_TUPLE],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'settled',
    stateMutability: 'view',
    inputs: [{ name: 'commitmentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },

  // -------- Events (for indexer / off-chain decoders) --------
  {
    type: 'event',
    name: 'CommitmentCreated',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'predictor', type: 'address', indexed: true },
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'minFillIn', type: 'uint256', indexed: false },
      { name: 'minAmountOut', type: 'uint256', indexed: false },
      { name: 'predictorWindowEnd', type: 'uint64', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'executorTip', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'sponsorUse', type: 'uint256', indexed: false },
      { name: 'walletUse', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Executed',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'filledIn', type: 'uint256', indexed: false },
      { name: 'filledOut', type: 'uint256', indexed: false },
      { name: 'refundedIn', type: 'uint256', indexed: false },
      { name: 'tipPaid', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SliceFilled',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'sliceIndex', type: 'uint256', indexed: true },
      { name: 'quoteHash', type: 'bytes32', indexed: true },
      { name: 'counterparty', type: 'address', indexed: false },
      { name: 'sliceIn', type: 'uint256', indexed: false },
      { name: 'sliceOut', type: 'uint256', indexed: false },
      { name: 'sliceBonusCollateral', type: 'uint256', indexed: false },
      { name: 'predictionId', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CommitmentExpired',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'walletRefunded', type: 'uint256', indexed: false },
      { name: 'sponsorReleased', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CounterpartySlashed',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'counterparty', type: 'address', indexed: true },
      { name: 'vaultDrained', type: 'uint256', indexed: false },
      { name: 'makeWhole', type: 'uint256', indexed: false },
      { name: 'poolContribution', type: 'uint256', indexed: false },
      { name: 'poolReceived', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'InsurancePoolFunded',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'fromCounterparty', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'InsurancePoolDrawn',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi;
