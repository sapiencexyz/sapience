/**
 * Hand-rolled ABI for `InsurancePool` — public read surface.
 *
 * Only the balance view is exposed; `contribute`/`drawFor` are executor-only
 * and not called from the SDK.
 */

import type { Abi } from 'abitype';

export const insurancePoolAbi = [
  {
    type: 'function',
    name: 'balance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi;
