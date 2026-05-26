import type { Address } from 'viem';

const STORAGE_KEY = 'bingo-card-contract-address';

export function loadContractAddress(): Address | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as Address) : null;
}

export function saveContractAddress(addr: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, addr);
}

export const BINGO_CARD_ABI = [
  // reads
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'collateralToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'poolVersion', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'poolSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'cardPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'perLineStake', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'referralBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'cardExpirySeconds', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'bonusPool', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // writes
  {
    type: 'function',
    name: 'setPool',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'bytes32[]', name: 'conditionIds' },
      { type: 'address[]', name: 'resolvers' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCardPrice',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'cardPrice_' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setReferralBps',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint16', name: 'bps' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCardExpiry',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint64', name: 'cardExpirySeconds_' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositBonus',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'amount' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawBonus',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256', name: 'amount' },
      { type: 'address', name: 'to' },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'spender' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'value' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'account' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;
