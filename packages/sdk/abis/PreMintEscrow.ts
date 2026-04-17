/**
 * Hand-rolled ABI for `PreMintEscrow` — minimal read surface.
 *
 * SDK only needs `creditOf` (show predictor pre-mint credit) and
 * `withdrawCredit` (user withdraws after expiry) from the SDK client side.
 * The `lock`/`settle`/`releaseAll` executor-only functions are omitted here
 * to keep the file tiny; they can be added when the keeper package needs them.
 */

import type { Abi } from 'abitype';

export const preMintEscrowAbi = [
  {
    type: 'function',
    name: 'creditOf',
    stateMutability: 'view',
    inputs: [{ name: 'predictor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdrawCredit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'predictor', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi;
