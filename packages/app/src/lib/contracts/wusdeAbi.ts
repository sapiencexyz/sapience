import { parseAbi } from 'viem';

/**
 * Minimal wUSDe ABI used app-side for wrap/unwrap/transfer/balance reads.
 * Matches the SDK-side definition in `packages/sdk/onchain/sharedAbis.ts`,
 * but lives here so app components can import it without pulling in the
 * SDK's onchain runtime.
 */
export const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);
