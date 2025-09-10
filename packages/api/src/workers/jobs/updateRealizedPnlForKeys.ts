import prisma from '../../db';

export type RealizedPnlKey = {
  chainId: number;
  address: string; // market group address
  marketId: number;
  owner: string;
};

export async function updateRealizedPnlForKeys(
  keys: RealizedPnlKey[]
): Promise<void> {
  if (!keys || keys.length === 0) return;

  // Normalize keys
  const normalized = keys.map((k) => ({
    chainId: k.chainId,
    address: k.address.toLowerCase(),
    marketId: k.marketId,
    owner: k.owner.toLowerCase(),
  }));

  // Compute realized PnL per key by scanning closed positions and collateral transfers
  for (const k of normalized) {
    const market = await prisma.market.findFirst({
      where: {
        market_group: { chainId: k.chainId, address: k.address },
        marketId: k.marketId,
      },
      select: { id: true },
    });
    if (!market) continue;

    // Positions for this owner in this market
    const positions = await prisma.position.findMany({
      where: { marketId: market.id, owner: k.owner },
      select: {
        collateral: true,
        transaction: {
          select: { collateral_transfer: { select: { collateral: true } } },
        },
      },
    });

    let totalDeposits = 0n;
    let totalWithdrawals = 0n;
    for (const p of positions) {
      const isClosed = (p.collateral || '0') === '0';
      if (!isClosed) continue; // realized only for closed positions
      for (const t of p.transaction) {
        const c = t.collateral_transfer?.collateral;
        if (!c) continue;
        const val = BigInt(c.toString());
        if (val < 0n)
          totalWithdrawals += -val; // negative is withdraw
        else totalDeposits += val;
      }
    }
    const realized = totalWithdrawals - totalDeposits;

    await prisma.ownerMarketRealizedPnl.upsert({
      where: {
        chainId_address_marketId_owner: {
          chainId: k.chainId,
          address: k.address,
          marketId: k.marketId,
          owner: k.owner,
        },
      },
      update: { realizedPnl: realized.toString() },
      create: {
        chainId: k.chainId,
        address: k.address,
        marketId: k.marketId,
        owner: k.owner,
        realizedPnl: realized.toString(),
      },
    });
  }
}
