/**
 * Shared ABI definitions used across multiple onchain modules.
 *
 * Extracted to avoid duplication between trading, position, escrow, attest, and eas.
 */

import { parseAbi } from 'viem';

/** WUSDe ABI for wrap/unwrap operations */
export const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

/** ERC20 ABI for approvals, balances, and token metadata */
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

/** EAS ABI (attest function) */
export const EAS_ABI = [
  {
    name: 'attest',
    type: 'function',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const;

/** EAS schema id for forecast attestations */
export const EAS_SCHEMA_ID: `0x${string}` =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';
