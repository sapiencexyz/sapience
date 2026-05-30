import { formatUnits, type Address, type Hex } from 'viem';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';

// Bingo runs against Ethereal testnet (staging).
export const CHAIN_ID = CHAIN_ID_ETHEREAL_TESTNET;
export const DECIMALS = 18;

const STORAGE_KEY = 'bingo-card-contract-address';

export function shortAddress(a?: string | null): string {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtUnits(v: bigint | undefined): string {
  if (v == null) return '—';
  return formatUnits(v, DECIMALS);
}

/** Encode a UTF-8 string into a left-padded bytes32. Returns null when the
 *  string is empty or longer than 32 bytes. */
export function encodeCode(s: string): Hex | null {
  const enc = new TextEncoder().encode(s.trim());
  if (enc.length === 0 || enc.length > 32) return null;
  const bytes = new Uint8Array(32);
  bytes.set(enc);
  return ('0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')) as Hex;
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/** Deployed BingoCard on Ethereal testnet (2026-05-30, on-chain cell draw —
 *  no entropy contract). Baked-in default so hosted builds work without env
 *  config; override via Settings or VITE_BINGO_CONTRACT_ADDRESS. */
const DEFAULT_CONTRACT_ADDRESS =
  '0x4c1fac4c78f4afac7852769cdfd41bf158b6b765' as const;

export function loadContractAddress(): Address | null {
  if (typeof window === 'undefined') return null;
  // Precedence: UI override (Settings) → build-time env → baked-in default.
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v && ADDR_RE.test(v)) return v as Address;
  const envAddr = import.meta.env.VITE_BINGO_CONTRACT_ADDRESS;
  if (envAddr && ADDR_RE.test(envAddr)) return envAddr as Address;
  return DEFAULT_CONTRACT_ADDRESS as Address;
}

export function saveContractAddress(addr: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, addr);
}

export const BINGO_CARD_ABI = [
  // ---- views: config ----
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'collateralToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'escrow', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'poolVersion', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'poolSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'minCardPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'minPerLineStake', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'referralBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'cardExpirySeconds', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'bonusPool', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'outstandingSponsorBalance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'outstandingReferralEarnings', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextCardId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // ---- views: cards / referrers ----
  {
    type: 'function',
    name: 'cardOf',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'cardId' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { type: 'address', name: 'player' },
          { type: 'bytes32', name: 'refCode' },
          { type: 'uint32', name: 'poolVersion' },
          { type: 'uint64', name: 'mintedAt' },
          { type: 'uint64', name: 'expiresAt' },
          { type: 'uint256', name: 'sponsorBalance' },
          { type: 'uint256', name: 'cardPriceAtMint' },
          { type: 'uint16', name: 'referralBpsAtMint' },
          { type: 'bool', name: 'referrerPaid' },
          { type: 'bool', name: 'sidesDeclared' },
          { type: 'uint16', name: 'filledLineBitmap' },
          { type: 'uint16', name: 'cellSides' },
          { type: 'bytes32[16]', name: 'conditionIds' },
          { type: 'address[16]', name: 'resolvers' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'referrerOf',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32', name: 'code' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'referralEarnings',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'referrer' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'lineCells',
    stateMutability: 'pure',
    inputs: [{ type: 'uint8', name: 'lineIndex' }],
    outputs: [{ type: 'uint8[4]' }],
  },
  {
    type: 'function',
    name: 'multiplierBps',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'winCount' }],
    outputs: [{ type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'bonusClaimed',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'cardId' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'previewBonus',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'cardId' }],
    outputs: [
      { type: 'uint8', name: 'wins' },
      { type: 'uint256', name: 'payout' },
    ],
  },
  // ---- writes: admin ----
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
    name: 'setMinCardPrice',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'minCardPrice_' }],
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
    name: 'setEscrow',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address', name: 'escrow_' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setMultipliers',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint32[11]', name: 'bps' }],
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
  // ---- writes: user-facing ----
  {
    type: 'function',
    name: 'mintCard',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'bytes32', name: 'refCode' },
      { type: 'uint256', name: 'cardPrice_' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'registerCode',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bytes32', name: 'code' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimReferralEarnings',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address', name: 'to' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCellSides',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256', name: 'cardId' },
      { type: 'uint16', name: 'yesMask' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawUnused',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'cardId' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimBonus',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'cardId' }],
    outputs: [],
  },
  // ---- events ----
  {
    type: 'event',
    name: 'CardMinted',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'address', name: 'player', indexed: true },
      { type: 'bytes32', name: 'refCode', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CardRevealed',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'bytes32', name: 'seed', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LineFunded',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'uint8', name: 'lineIndex', indexed: true },
      { type: 'uint256', name: 'stake', indexed: false },
      { type: 'uint16', name: 'filledBitmap', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SidesDeclared',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'uint16', name: 'yesMask', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CardCompleted',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'address', name: 'referrer', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'BonusClaimed',
    inputs: [
      { type: 'uint256', name: 'cardId', indexed: true },
      { type: 'address', name: 'player', indexed: true },
      { type: 'uint8', name: 'winCount', indexed: false },
      { type: 'uint256', name: 'payout', indexed: false },
    ],
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
