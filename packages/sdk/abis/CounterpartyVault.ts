/**
 * Hand-rolled ABI for `CounterpartyVault` — counterparty-facing surface.
 *
 * Executor-only functions (`slashTotal`, `pullOut`) are intentionally
 * omitted; they're only relevant to `CommittedIntentExecutor`.
 */

import type { Abi } from 'abitype';

export const counterpartyVaultAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'cp', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'earliestWithdrawal',
    stateMutability: 'view',
    inputs: [{ name: 'cp', type: 'address' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'bumpEarliestWithdrawal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'when', type: 'uint64' }],
    outputs: [],
  },

  // -------- Events (for indexer / off-chain decoders) --------
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'cp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'cp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi;
