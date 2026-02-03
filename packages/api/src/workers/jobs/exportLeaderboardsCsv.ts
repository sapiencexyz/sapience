import prisma from '../../db';
import { calculatePositionPnL } from '../../helpers/positionPnL';
import fs from 'fs';

const DEFAULT_DECIMALS = 18;

export async function exportLeaderboardsCsv(): Promise<void> {
  // 1. Export PnL Leaderboard
  console.log('Fetching PnL leaderboard...');
  const positionPnL = await calculatePositionPnL();

  const aggregatedPnL = new Map<string, number>();
  for (const r of positionPnL) {
    const owner = r.owner.toLowerCase();
    const divisor = Math.pow(10, DEFAULT_DECIMALS);
    const val = parseFloat(r.totalPnL) / divisor;
    if (!Number.isFinite(val)) continue;
    aggregatedPnL.set(owner, (aggregatedPnL.get(owner) || 0) + val);
  }

  const pnlEntries = Array.from(aggregatedPnL.entries())
    .map(([owner, totalPnL]) => ({ owner, totalPnL }))
    .sort((a, b) => b.totalPnL - a.totalPnL);

  // Create PnL CSV
  const pnlCsvHeader = 'rank,owner,totalPnL';
  const pnlCsvRows = pnlEntries.map(
    (entry, idx) => `${idx + 1},${entry.owner},${entry.totalPnL.toFixed(6)}`
  );
  const pnlCsv = [pnlCsvHeader, ...pnlCsvRows].join('\n');

  fs.writeFileSync('pnl_leaderboard.csv', pnlCsv);
  console.log(`Exported ${pnlEntries.length} entries to pnl_leaderboard.csv`);

  // 2. Export Accuracy Leaderboard
  console.log('\nFetching accuracy leaderboard...');

  // Query AttesterMarketTwError grouped by attester
  const twErrors = await prisma.attesterMarketTwError.groupBy({
    by: ['attester'],
    _sum: { twError: true },
    _count: { twError: true },
  });

  const accuracyEntries = twErrors
    .map((row) => ({
      attester: row.attester,
      numMarkets: row._count.twError,
      sumTwError: row._sum.twError || 0,
      accuracyScore:
        row._count.twError > 0
          ? (row._sum.twError || 0) / row._count.twError
          : 0,
    }))
    .sort((a, b) => b.accuracyScore - a.accuracyScore);

  // Create Accuracy CSV
  const accuracyCsvHeader = 'rank,attester,numMarkets,sumTwError,accuracyScore';
  const accuracyCsvRows = accuracyEntries.map(
    (entry, idx) =>
      `${idx + 1},${entry.attester},${entry.numMarkets},${entry.sumTwError.toFixed(6)},${entry.accuracyScore.toFixed(6)}`
  );
  const accuracyCsv = [accuracyCsvHeader, ...accuracyCsvRows].join('\n');

  fs.writeFileSync('accuracy_leaderboard.csv', accuracyCsv);
  console.log(
    `Exported ${accuracyEntries.length} entries to accuracy_leaderboard.csv`
  );

  console.log('\nDone! Files created:');
  console.log('  - pnl_leaderboard.csv');
  console.log('  - accuracy_leaderboard.csv');
}
