import prisma from '../db';
import { ParlayStatus } from '../../generated/prisma';

export interface ParlayPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  parlayCount: number;
}

export async function calculateParlayPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<ParlayPnLEntry[]> {
  const whereClause: {
    status: { in: ParlayStatus[] };
    makerWon: { not: null };
    chainId?: number;
    marketAddress?: string;
  } = {
    status: { in: [ParlayStatus.settled, ParlayStatus.consolidated] },
    makerWon: { not: null },
  };

  if (chainId) whereClause.chainId = chainId;
  if (marketAddress) whereClause.marketAddress = marketAddress.toLowerCase();

  const parlays = await prisma.parlay.findMany({ where: whereClause });

  const mintTimestamps = Array.from(
    new Set(parlays.map((p) => BigInt(p.mintedAt)))
  );
  const mintEvents = await prisma.event.findMany({
    where: {
      marketGroupId: null,
      timestamp: { in: mintTimestamps },
    },
  });

  const mintEventMap = new Map();
  for (const event of mintEvents) {
    try {
      const data = event.logData as {
        eventType?: string;
        makerNftTokenId?: string;
        takerNftTokenId?: string;
        makerCollateral?: string;
        takerCollateral?: string;
        totalCollateral?: string;
      };
      if (data.eventType === 'PredictionMinted') {
        const key = `${data.makerNftTokenId}-${data.takerNftTokenId}`;
        mintEventMap.set(key, data);
      }
    } catch {
      continue;
    }
  }

  const ownerStats = new Map<
    string,
    { totalPnL: bigint; parlayCount: number }
  >();

  for (const parlay of parlays) {
    const mintKey = `${parlay.makerNftTokenId}-${parlay.takerNftTokenId}`;
    const mintData = mintEventMap.get(mintKey);
    if (!mintData) continue;

    const maker = parlay.maker.toLowerCase();
    const taker = parlay.taker.toLowerCase();
    const makerCollateral = BigInt(mintData.makerCollateral || '0');
    const takerCollateral = BigInt(mintData.takerCollateral || '0');
    const totalCollateral = BigInt(mintData.totalCollateral || '0');

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(maker) && !ownerSet.has(taker)) continue;
    }

    if (!ownerStats.has(maker)) {
      ownerStats.set(maker, { totalPnL: 0n, parlayCount: 0 });
    }
    if (!ownerStats.has(taker)) {
      ownerStats.set(taker, { totalPnL: 0n, parlayCount: 0 });
    }

    const makerStats = ownerStats.get(maker)!;
    const takerStats = ownerStats.get(taker)!;

    if (parlay.makerWon) {
      // Maker wins: profit = totalCollateral - makerCollateral
      makerStats.totalPnL += totalCollateral - makerCollateral;
      makerStats.parlayCount++;
      // Taker loses: loss = -takerCollateral
      takerStats.totalPnL -= takerCollateral;
      takerStats.parlayCount++;
    } else {
      // Taker wins: profit = totalCollateral - takerCollateral
      takerStats.totalPnL += totalCollateral - takerCollateral;
      takerStats.parlayCount++;
      // Maker loses: loss = -makerCollateral
      makerStats.totalPnL -= makerCollateral;
      makerStats.parlayCount++;
    }
  }

  return Array.from(ownerStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: stats.totalPnL.toString(),
    parlayCount: stats.parlayCount,
  }));
}
