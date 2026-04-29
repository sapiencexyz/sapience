/**
 * Verify the "sponsorship" hypothesis for the −241 USDe Δ on the protocol vault.
 *
 * For each `CollateralTransfer` where the vault is the `from` side and the
 * recipient is one of the configured escrow addresses, look up the
 * Prediction(s) created in the same transaction and check whether the vault
 * was the `predictor` or `counterparty`. Sum vault outflows by category:
 *
 *   - "primary"        : vault is on a side of the Prediction (tracked in
 *                        calculateVaultPnL's `primary` collateral)
 *   - "sponsorship"    : Prediction exists but vault is NEITHER side — the
 *                        wUSDe funded a mint where the Prediction record has
 *                        another user as predictor/counterparty
 *   - "no_prediction"  : no Prediction row found for the tx — likely topup,
 *                        bilateral burn collateral movement, or indexer gap
 *
 * Read-only. Writes nothing.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultSponsorship.ts
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultSponsorship.ts --vaultAddress 0x1f5f...
 */
import prisma from '../src/core/db';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { getConfiguredVaults } from '../src/services/protocolStats';

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

const fmt = (b: bigint): string => {
  const s = b.toString();
  if (s.length <= 18) return `0.${'0'.repeat(18 - s.length)}${s}`;
  return `${s.slice(0, -18)}.${s.slice(-18)}`;
};

async function main(): Promise<void> {
  const chainId = parseNum('--chainId', 5064014);
  const vaultArg = parseFlag('--vaultAddress')?.toLowerCase();

  const vaultAddress =
    vaultArg ??
    getConfiguredVaults(chainId).find((v) => v.kind === 'protocol')?.address;
  if (!vaultAddress) {
    throw new Error(`No protocol vault configured for chain ${chainId}`);
  }

  // Build the set of "escrow" addresses: primary + every legacy.
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  if (!escrowConfig) {
    throw new Error(`No predictionMarketEscrow configured for chain ${chainId}`);
  }
  const escrowAddrs = new Set<string>();
  escrowAddrs.add(escrowConfig.address.toLowerCase());
  for (const le of escrowConfig.legacy ?? []) {
    escrowAddrs.add(normalizeLegacyEntry(le).address.toLowerCase());
  }

  console.log(
    `[checkSponsorship] chainId=${chainId} vault=${vaultAddress}  escrows=[${[...escrowAddrs].join(', ')}]`
  );

  const transfers = await prisma.collateralTransfer.findMany({
    where: { chainId, from: vaultAddress, to: { in: [...escrowAddrs] } },
    select: { transactionHash: true, value: true, to: true, timestamp: true },
    orderBy: { blockNumber: 'asc' },
  });

  console.log(
    `[checkSponsorship] ${transfers.length} vault → escrow Transfer events`
  );

  // Group by tx so we can look up all Predictions created in that tx in
  // one shot.
  const txMap = new Map<string, { totalValue: bigint; toCount: number }>();
  for (const t of transfers) {
    const existing = txMap.get(t.transactionHash) ?? {
      totalValue: 0n,
      toCount: 0,
    };
    existing.totalValue += BigInt(t.value);
    existing.toCount += 1;
    txMap.set(t.transactionHash, existing);
  }

  const txHashes = [...txMap.keys()];
  const predictions = await prisma.prediction.findMany({
    where: { chainId, createTxHash: { in: txHashes } },
    select: {
      createTxHash: true,
      predictor: true,
      counterparty: true,
      predictorCollateral: true,
      counterpartyCollateral: true,
    },
  });

  const predsByTx = new Map<string, typeof predictions>();
  for (const p of predictions) {
    const arr = predsByTx.get(p.createTxHash) ?? [];
    arr.push(p);
    predsByTx.set(p.createTxHash, arr);
  }

  let primaryOut = 0n;
  let sponsorshipOut = 0n;
  let noPredictionOut = 0n;
  let primaryTxCount = 0;
  let sponsorshipTxCount = 0;
  let noPredictionTxCount = 0;
  const sponsorshipExamples: {
    tx: string;
    value: bigint;
    predictor: string;
    counterparty: string;
  }[] = [];

  for (const [tx, info] of txMap) {
    const preds = predsByTx.get(tx);
    if (!preds || preds.length === 0) {
      noPredictionOut += info.totalValue;
      noPredictionTxCount += 1;
      continue;
    }
    const vaultOnSide = preds.some(
      (p) =>
        p.predictor.toLowerCase() === vaultAddress ||
        p.counterparty.toLowerCase() === vaultAddress
    );
    if (vaultOnSide) {
      primaryOut += info.totalValue;
      primaryTxCount += 1;
    } else {
      sponsorshipOut += info.totalValue;
      sponsorshipTxCount += 1;
      if (sponsorshipExamples.length < 5) {
        sponsorshipExamples.push({
          tx,
          value: info.totalValue,
          predictor: preds[0].predictor,
          counterparty: preds[0].counterparty,
        });
      }
    }
  }

  console.log('\n── outflow categorization ─────────────────────────────');
  console.log(
    `  primary (vault on side):    ${fmt(primaryOut).padStart(28)} wUSDe over ${primaryTxCount} txs`
  );
  console.log(
    `  sponsorship (vault NOT on either side, but Prediction exists):`
  );
  console.log(
    `                              ${fmt(sponsorshipOut).padStart(28)} wUSDe over ${sponsorshipTxCount} txs`
  );
  console.log(
    `  no_prediction (no Prediction in tx):`
  );
  console.log(
    `                              ${fmt(noPredictionOut).padStart(28)} wUSDe over ${noPredictionTxCount} txs`
  );
  console.log(
    `  ──────────────────────────────────────────────────────`
  );
  const total = primaryOut + sponsorshipOut + noPredictionOut;
  console.log(`  total vault → escrow:      ${fmt(total).padStart(28)} wUSDe`);

  if (sponsorshipExamples.length > 0) {
    console.log('\n── sample sponsorship txs ─────────────────────────────');
    for (const ex of sponsorshipExamples) {
      console.log(
        `  tx ${ex.tx.slice(0, 12)}… value=${fmt(ex.value)} predictor=${ex.predictor} counterparty=${ex.counterparty}`
      );
    }
  }

  // List every no_prediction tx — these are the un-tracked outflows.
  if (noPredictionTxCount > 0) {
    console.log('\n── no-prediction txs (drilldown) ──────────────────────');
    for (const [tx, info] of txMap) {
      const preds = predsByTx.get(tx);
      if (preds && preds.length > 0) continue;

      const [events, claims, closes, secondaryTrades] = await Promise.all([
        prisma.event.findMany({
          where: { transactionHash: tx },
          select: { blockNumber: true, logData: true, logIndex: true },
          orderBy: { logIndex: 'asc' },
        }),
        prisma.claim.findMany({
          where: { chainId, txHash: tx },
          select: { holder: true, collateralPaid: true },
        }),
        prisma.close.findMany({
          where: { chainId, txHash: tx },
          select: {
            predictorHolder: true,
            counterpartyHolder: true,
            predictorPayout: true,
            counterpartyPayout: true,
          },
        }),
        prisma.secondaryTrade.findMany({
          where: { chainId, txHash: tx },
          select: { buyer: true, seller: true, price: true },
        }),
      ]);

      const block = events[0]?.blockNumber ?? '?';
      console.log(
        `  tx ${tx}  value=${fmt(info.totalValue)}  block=${block}  events=${events.length}`
      );
      if (claims.length) {
        console.log(
          `    claims: ${claims.length} — ${claims.map((c) => `${c.holder.slice(0, 10)}…=${fmt(BigInt(c.collateralPaid))}`).join(', ')}`
        );
      }
      if (closes.length) {
        console.log(`    closes: ${closes.length}`);
        for (const c of closes) {
          console.log(
            `      pred=${c.predictorHolder.slice(0, 10)}…(${fmt(BigInt(c.predictorPayout))})  cp=${c.counterpartyHolder.slice(0, 10)}…(${fmt(BigInt(c.counterpartyPayout))})`
          );
        }
      }
      if (secondaryTrades.length) {
        console.log(
          `    secondary trades: ${secondaryTrades.length} — ${secondaryTrades.map((s) => `${s.buyer.slice(0, 10)}↔${s.seller.slice(0, 10)} ${fmt(BigInt(s.price))}`).join(', ')}`
        );
      }
      // Print the raw event names from logData if available
      const eventNames = events
        .map((e) => {
          const data = e.logData as { eventName?: string } | null;
          return data?.eventName ?? '?';
        })
        .filter((n) => n !== '?');
      if (eventNames.length) {
        console.log(`    indexed event names: ${eventNames.join(', ')}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
