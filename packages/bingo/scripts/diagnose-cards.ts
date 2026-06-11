// Diagnostic: reconstruct submitted cards from on-chain receipts (DEPLOYED
// single-card contract layout) and the committed pool, to compare the
// filled card (token 1) vs the unfilled one (token 2).
import {
  concatHex,
  createPublicClient,
  http,
  keccak256,
  pad,
  stringToBytes,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import pool from '../pool.json' with { type: 'json' };

const RPC = 'https://rpc.etherealtest.net';
const RECEIPT = '0x8fAacd942F8fB0de35F559a1ba6302806489b420' as Address;

// Deployed contract: no cardIndex field.
const ABI = [
  {
    type: 'function',
    name: 'cardMeta',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'tokenId' }],
    outputs: [
      { type: 'bytes32', name: 'poolHash' },
      { type: 'bytes32', name: 'seed' },
      { type: 'address', name: 'referrer' },
      { type: 'uint64', name: 'submittedAt' },
      { type: 'uint16', name: 'yesMask' },
      { type: 'uint256', name: 'cardPrice' },
      { type: 'bool', name: 'bonusPaid' },
      { type: 'bool', name: 'referralPaid' },
    ],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const;

// drawCells as committed/deployed (f57750b92): partial Fisher-Yates.
function drawCells<T>(poolArr: readonly T[], seed: Hex, count = 16): T[] {
  const arr = [...poolArr];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = keccak256(concatHex([s, pad(toHex(i), { size: 32 })]));
    const j = i + Number(BigInt(s) % BigInt(arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

const client = createPublicClient({ transport: http(RPC) });

console.log(
  `pool ${pool.poolId} hash=${keccak256(stringToBytes(pool.poolId))} conditions=${pool.conditions.length}`,
);

for (const tokenId of [1n, 2n]) {
  const [meta, owner] = await Promise.all([
    client.readContract({ address: RECEIPT, abi: ABI, functionName: 'cardMeta', args: [tokenId] }),
    client.readContract({ address: RECEIPT, abi: ABI, functionName: 'ownerOf', args: [tokenId] }),
  ]);
  const [poolHash, seed, , submittedAt, yesMask, cardPrice] = meta;
  console.log(`\n=== token ${tokenId} owner=${owner}`);
  console.log(
    `poolHash=${poolHash}\nseed=${seed}\nyesMask=0b${yesMask.toString(2).padStart(16, '0')} ` +
      `cardPrice=${Number(cardPrice) / 1e18} wUSDe stake/line=${Number(cardPrice) / 10 / 1e18} ` +
      `submittedAt=${new Date(Number(submittedAt) * 1000).toISOString()}`,
  );
  const cells = drawCells(pool.conditions, seed as Hex);
  cells.forEach((c, i) => {
    const side = (yesMask >> i) & 1 ? 'YES' : 'NO ';
    console.log(
      `  cell ${String(i).padStart(2)} ${side} ${c.shortName ?? c.question} (${c.conditionId.slice(0, 10)})`,
    );
  });
}
