import { TIME_INTERVALS } from 'src/fixtures';
import prisma from 'src/db';
import { startOfInterval } from 'src/candle-cache/candleUtils';

interface PnLData {
  owner: string;
  positionIds: Set<number>;
  positionCount: number;
  openPositionsPnL: string;
  totalDeposits: string;
  totalWithdrawals: string;
  totalPnL: string;
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
      return market.pnlData;
    }

    // Build the pnlData array for this market and datapointTime
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
            totalDeposits: '0',
            totalWithdrawals: '0',
            openPositionsPnL: '0',
            totalPnL: '0',
          });
        }

        const ownerPnl = pnlByOwner.get(ownerId)!;
        if (!ownerPnl.positionIds.has(position.positionId)) {
          ownerPnl.positionCount++;
          ownerPnl.positionIds.add(position.positionId);
        }
        // 4. Check if this position is closed (collateral = 0) and calculate realized PnL
        const positionCollateralString = position.collateral || '0';
        const isPositionClosed = positionCollateralString === '0';

        // Only include PnL from closed positions (realized PnL)
        if (isPositionClosed && position.transaction.length > 0) {
          for (const transaction of position.transaction) {
            if (transaction.collateral_transfer) {
              try {
                // Convert collateral to string (will be string after migration, but currently still Decimal)
                const collateralString =
                  transaction.collateral_transfer.collateral.toString();

                // For closed positions, sum all collateral movements to get net realized PnL
                if (collateralString.startsWith('-')) {
                  // Negative collateral (withdrawal) - add absolute value to withdrawals
                  const absoluteValue = collateralString.slice(1);
                  const currentWithdrawals = BigInt(ownerPnl.totalWithdrawals);
                  ownerPnl.totalWithdrawals = (
                    currentWithdrawals + BigInt(absoluteValue)
                  ).toString();
                } else if (collateralString !== '0') {
                  // Positive collateral (deposit)
                  const currentDeposits = BigInt(ownerPnl.totalDeposits);
                  ownerPnl.totalDeposits = (
                    currentDeposits + BigInt(collateralString)
                  ).toString();
                }
              } catch (error) {
                console.error(
                  `Error processing collateral for ${ownerId}:`,
                  error,
                  'Raw value:',
                  transaction.collateral_transfer.collateral
                );
              }
            }
          }
        }
        const withdrawals = BigInt(ownerPnl.totalWithdrawals);
        const deposits = BigInt(ownerPnl.totalDeposits);
        ownerPnl.totalPnL = (withdrawals - deposits).toString();
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
        return undefined;
      }

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
