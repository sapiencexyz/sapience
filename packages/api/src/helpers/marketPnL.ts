import { TIME_INTERVALS } from 'src/fixtures';
import prisma from 'src/db';
import { startOfInterval } from 'src/candle-cache/candleUtils';

interface PnLData {
  owner: string;
  positionIds: Set<number>;
  positionCount: number;
  openPositionsPnL: bigint;
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  totalPnL: bigint;
}

interface MarketData {
  id: number;
  chainId: number;
  address: string;
  marketId: number;
}

interface MarketPnLData {
  marketData: MarketData;
  pnlData: PnLData[];
  datapointTime: number;
}

export class MarketPnL {
  private static instance: MarketPnL;
  private INTERVAL = TIME_INTERVALS.intervals.INTERVAL_5_MINUTES;

  private markets: MarketPnLData[] = [];

  private constructor() {
    // Private constructor to prevent direct construction calls with the `new` operator
  }

  public static getInstance(): MarketPnL {
    if (!MarketPnL.instance) {
      MarketPnL.instance = new MarketPnL();
    }

    return MarketPnL.instance;
  }

  async getMarketPnLs(chainId: number, address: string, marketId: number) {
    console.log(`[PnL DEBUG] Getting PnL for market: chainId=${chainId}, address=${address}, marketId=${marketId}`);
    const currentTimestamp = Date.now() / 1000;
    const datapointTime = startOfInterval(currentTimestamp, this.INTERVAL);

    let market = this.markets.find(
      (data) =>
        data.marketData.chainId === chainId &&
        data.marketData.address === address.toLowerCase() &&
        data.marketData.marketId === marketId
    );

    if (!market) {
      market = await this.getMarketData(chainId, address, marketId);
      if (!market) {
        return [];
      }
    }

    if (market.datapointTime === datapointTime) {
      console.log(`[PnL DEBUG] Returning cached data (last calculated at ${new Date(market.datapointTime * 1000).toISOString()})`);
      return market.pnlData;
    }

    // Build the pnlData array for this market and datapointTime
    console.log(`[PnL DEBUG] Recalculating PnL data (new datapoint time: ${new Date(datapointTime * 1000).toISOString()})`);
    market.pnlData = await this.buildPnlData(market.marketData);
    market.datapointTime = datapointTime;

    return market.pnlData;
  }

  private async buildPnlData(marketData: MarketData): Promise<PnLData[]> {
    try {
      // 1. Fetch positions for the market
      const positions = await prisma.position.findMany({
        where: {
          marketId: marketData.id,
        },
        include: {
          transaction: {
            include: {
              collateral_transfer: true,
            },
          },
          market: true,
        },
      });

      // 2 & 3. Group positions by owner and create PnL entries
      const pnlByOwner = new Map<string, PnLData>();

      for (const position of positions) {
        if (!position.owner) continue; // Skip positions without owner

        const ownerId = position.owner.toLowerCase();

        if (!pnlByOwner.has(ownerId)) {
          pnlByOwner.set(ownerId, {
            owner: ownerId,
            positionCount: 0,
            positionIds: new Set(),
            totalDeposits: BigInt(0),
            totalWithdrawals: BigInt(0),
            openPositionsPnL: BigInt(0),
            totalPnL: BigInt(0),
          });
        }

        const ownerPnl = pnlByOwner.get(ownerId)!;
        if (!ownerPnl.positionIds.has(position.positionId)) {
          ownerPnl.positionCount++;
          ownerPnl.positionIds.add(position.positionId);
        }
        // 4. Account for collateral changes
        if (position.transaction.length > 0) {
          for (const transaction of position.transaction) {
            if (transaction.collateral_transfer) {
              const collateral = BigInt(
                transaction.collateral_transfer.collateral.toString()
              );
              if (collateral > BigInt(0)) {
                ownerPnl.totalDeposits += collateral;
              } else {
                ownerPnl.totalWithdrawals -= collateral;
              }
            }
          }
        }
        ownerPnl.totalPnL = ownerPnl.totalWithdrawals - ownerPnl.totalDeposits;
        console.log(`[PnL DEBUG] Owner ${ownerId}: deposits=${ownerPnl.totalDeposits}, withdrawals=${ownerPnl.totalWithdrawals}, totalPnL=${ownerPnl.totalPnL}`);
      }

      // 6. Return the PnL data array
      return Array.from(pnlByOwner.values());
    } catch (error) {
      console.error(`Error building PnL data: ${error}`);
      return [];
    }
  }

  private async getMarketData(
    chainId: number,
    address: string,
    marketId: number
  ): Promise<MarketPnLData | undefined> {
    try {
      const market = await prisma.market.findFirst({
        where: {
          market_group: {
            chainId,
            address: address.toLowerCase(),
          },
          marketId: Number(marketId),
        },
        include: {
          market_group: true,
        },
      });

      if (!market) {
        console.log(`[PnL DEBUG] Market not found for chainId=${chainId}, address=${address}, marketId=${marketId}`);
        return undefined;
      }

      console.log(`[PnL DEBUG] Found market with collateral: ${market.market_group?.collateralAsset}, symbol: ${market.market_group?.collateralSymbol}`);

      const marketPnLData: MarketPnLData = {
        marketData: {
          id: market.id,
          chainId,
          address,
          marketId: marketId,
        },
        pnlData: [],
        datapointTime: 0,
      };

      this.markets.push(marketPnLData);

      return marketPnLData;
    } catch (error) {
      console.error('Error fetching market data:', error);
      return undefined;
    }
  }
}
