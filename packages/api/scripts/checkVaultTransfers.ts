/**
 * Read-only diagnostic. Enumerates ERC-20 Transfer events on the collateral
 * (wUSDe) contract where the configured vault is either sender or recipient,
 * within a given block range. Useful when on-chain `balanceOf(vault)` deltas
 * don't match what the indexed prediction settlements would predict — this
 * surfaces the actual USDe in/out flows so you can attribute the gap to a
 * specific tx and counterparty.
 *
 * Writes nothing. Pretty-prints:
 *   - Every Transfer where the vault is sender or recipient.
 *   - Each row labelled with known counterparties (escrow primary/legacy,
 *     other configured vaults) when applicable.
 *   - Net flow + reconciled "expected balance change."
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultTransfers.ts
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultTransfers.ts --chainId 5064014
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultTransfers.ts --vaultAddress 0x1f5f...
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultTransfers.ts --fromTs 1777305600 --toTs 1777320000
 */
import { formatUnits, parseAbiItem } from 'viem';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { getBlockByTimestamp, getProviderForChain } from '../src/utils/utils';
import { getConfiguredVaults } from '../src/helpers/protocolStats';

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

function parseFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(name);
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function parseNum(name: string, fallback: number): number {
  const raw = parseFlag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }
  return n;
}

async function main() {
  const chainId = parseNum('--chainId', 5064014);
  const vaultAddrArg = parseFlag('--vaultAddress')?.toLowerCase();
  const nowFloored = Math.floor(Date.now() / 1000 / 14400) * 14400;
  const toTs = parseNum('--toTs', nowFloored);
  const fromTs = parseNum('--fromTs', toTs - 4 * 3600);

  if (fromTs >= toTs) {
    throw new Error(`--fromTs (${fromTs}) must be < --toTs (${toTs})`);
  }

  const configured = getConfiguredVaults(chainId);
  const vault = vaultAddrArg
    ? configured.find((v) => v.address === vaultAddrArg)
    : configured.find((v) => v.kind === 'protocol');
  if (!vault) {
    throw new Error(
      `No matching vault for chain=${chainId} vaultAddress=${vaultAddrArg ?? '(default protocol)'}.`
    );
  }

  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;
  if (!collateralAddress) {
    throw new Error(`No collateral token configured for chain ${chainId}.`);
  }

  // Build a label map for known addresses we may see as counterparties.
  const knownAddresses = new Map<string, string>();
  knownAddresses.set(vault.address.toLowerCase(), `vault[${vault.kind}] (self)`);
  for (const v of configured) {
    if (v.address !== vault.address) {
      knownAddresses.set(v.address.toLowerCase(), `vault[${v.kind}]`);
      for (const le of v.config.legacy ?? []) {
        const a = normalizeLegacyEntry(le).address.toLowerCase();
        knownAddresses.set(a, `vault[${v.kind}, legacy]`);
      }
    }
  }
  // Vault's own legacy addresses
  for (const le of vault.config.legacy ?? []) {
    const a = normalizeLegacyEntry(le).address.toLowerCase();
    knownAddresses.set(a, `vault[${vault.kind}, legacy] (self)`);
  }
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  if (escrowConfig) {
    knownAddresses.set(
      escrowConfig.address.toLowerCase(),
      'predictionMarketEscrow[primary]'
    );
    for (const le of escrowConfig.legacy ?? []) {
      const a = normalizeLegacyEntry(le).address.toLowerCase();
      knownAddresses.set(a, 'predictionMarketEscrow[legacy]');
    }
  }

  const client = getProviderForChain(chainId);
  const fromBlockData = await getBlockByTimestamp(client, fromTs);
  const toBlockData = await getBlockByTimestamp(client, toTs);
  const fromBlock = fromBlockData.number;
  const toBlock = toBlockData.number;
  if (fromBlock === null || toBlock === null) {
    throw new Error(
      'getBlockByTimestamp returned a pending block; cannot proceed.'
    );
  }

  console.log(
    `[checkTransfers] vault=${vault.address} (${vault.kind})  chainId=${chainId}`
  );
  console.log(
    `[checkTransfers] window: ts ${fromTs}..${toTs}  ≈ block ${fromBlock}..${toBlock}`
  );
  console.log(`[checkTransfers] collateral=${collateralAddress}`);

  const vaultAddress = vault.address as `0x${string}`;

  const [transfersFrom, transfersTo] = await Promise.all([
    client.getLogs({
      address: collateralAddress,
      event: transferEvent,
      args: { from: vaultAddress },
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: collateralAddress,
      event: transferEvent,
      args: { to: vaultAddress },
      fromBlock,
      toBlock,
    }),
  ]);

  const fmt = (addr: string) => {
    const lc = addr.toLowerCase();
    const label = knownAddresses.get(lc);
    return label ? `${addr} (${label})` : addr;
  };

  const groupSum = new Map<string, { in: bigint; out: bigint; count: number }>();
  const bumpGroup = (
    counterpartyLabel: string,
    direction: 'in' | 'out',
    value: bigint
  ) => {
    const cur = groupSum.get(counterpartyLabel) ?? {
      in: 0n,
      out: 0n,
      count: 0,
    };
    if (direction === 'in') cur.in += value;
    else cur.out += value;
    cur.count += 1;
    groupSum.set(counterpartyLabel, cur);
  };

  const labelOf = (addr: string) => {
    const lc = addr.toLowerCase();
    return knownAddresses.get(lc) ?? `unknown[${addr.slice(0, 10)}…]`;
  };

  let totalOut = 0n;
  console.log('\n── transfers FROM vault ────────────────────────────────');
  if (transfersFrom.length === 0) {
    console.log('  (none)');
  }
  for (const log of transfersFrom) {
    const value = log.args.value!;
    totalOut += value;
    bumpGroup(labelOf(log.args.to!), 'out', value);
    console.log(
      `  blk ${log.blockNumber}  tx ${log.transactionHash?.slice(0, 10)}…  ` +
        `→ ${fmt(log.args.to!)}  ${formatUnits(value, 18)} wUSDe`
    );
  }
  console.log(
    `  ── total out: ${formatUnits(totalOut, 18)} wUSDe (${transfersFrom.length} transfers)`
  );

  let totalIn = 0n;
  console.log('\n── transfers TO vault ──────────────────────────────────');
  if (transfersTo.length === 0) {
    console.log('  (none)');
  }
  for (const log of transfersTo) {
    const value = log.args.value!;
    totalIn += value;
    bumpGroup(labelOf(log.args.from!), 'in', value);
    console.log(
      `  blk ${log.blockNumber}  tx ${log.transactionHash?.slice(0, 10)}…  ` +
        `← ${fmt(log.args.from!)}  ${formatUnits(value, 18)} wUSDe`
    );
  }
  console.log(
    `  ── total in: ${formatUnits(totalIn, 18)} wUSDe (${transfersTo.length} transfers)`
  );

  console.log('\n── by counterparty ─────────────────────────────────────');
  const sortedGroups = [...groupSum.entries()].sort((a, b) => {
    const aTotal = a[1].in + a[1].out;
    const bTotal = b[1].in + b[1].out;
    return bTotal > aTotal ? 1 : bTotal < aTotal ? -1 : 0;
  });
  for (const [label, agg] of sortedGroups) {
    console.log(
      `  ${label.padEnd(45)}  in=${formatUnits(agg.in, 18).padStart(20)}  out=${formatUnits(agg.out, 18).padStart(20)}  net=${formatUnits(agg.in - agg.out, 18).padStart(20)}  (${agg.count} transfers)`
    );
  }

  const netFlow = totalIn - totalOut;
  console.log('\n── net ─────────────────────────────────────────────────');
  console.log(`  net flow:                  ${formatUnits(netFlow, 18)} wUSDe`);
  console.log(
    `  predicted balance delta:   ${formatUnits(netFlow, 18)} wUSDe (= net flow on the wUSDe contract)`
  );
  console.log(
    `  → cross-check this against vaultBalance(ts_hi) − vaultBalance(ts_lo)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
