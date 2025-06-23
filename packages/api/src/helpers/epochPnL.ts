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

interface EpochData {
  id: number;
  chainId: number;
  address: string;
  epochId: number;
}

interface EpochPnLData {
  epochData: EpochData;
  pnlData: PnLData[];
  datapointTime: number;
}

export class EpochPnL {
  private static instance: EpochPnL;
  private INTERVAL = TIME_INTERVALS.intervals.INTERVAL_5_MINUTES;

  private epochs: EpochPnLData[] = [];

  private constructor() {
    // Private constructor to prevent direct construction calls with the `new` operator
  }

  public static getInstance(): EpochPnL {
    if (!EpochPnL.instance) {
      EpochPnL.instance = new EpochPnL();
    }

    return EpochPnL.instance;
  }

  async getEpochPnLs(chainId: number, address: string, epochId: number) {
    const currentTimestamp = Date.now() / 1000;
    const datapointTime = startOfInterval(currentTimestamp, this.INTERVAL);

    let epoch = this.epochs.find(
      (data) =>
        data.epochData.chainId === chainId &&
        data.epochData.address === address.toLowerCase() &&
        data.epochData.epochId === epochId
    );

    if (!epoch) {
      epoch = await this.getMarketData(chainId, address, epochId);
      if (!epoch) {
        return [];
      }
    }

    if (epoch.datapointTime === datapointTime) {
      return epoch.pnlData;
    }

    // Build the pnlData array for this epoch and datapointTime
    epoch.pnlData = await this.buildPnlData(epoch.epochData);
    epoch.datapointTime = datapointTime;

    return epoch.pnlData;
  }

  private async buildPnlData(epochData: EpochData): Promise<PnLData[]> {
    try {
      // 1. Fetch positions for the epoch
      const positions = await prisma.position.findMany({
        where: {
          marketId: epochData.id,
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
  ): Promise<EpochPnLData | undefined> {
    try {
      const epoch = await prisma.market.findFirst({
        where: {
          market_group: {
            chainId,
            address: address.toLowerCase(),
          },
          marketId: Number(marketId),
        },
      });

      if (!epoch) {
        return undefined;
      }

      const epochPnLData: EpochPnLData = {
        epochData: {
          id: epoch.id,
          chainId,
          address,
          epochId: marketId,
        },
        pnlData: [],
        datapointTime: 0,
      };

      this.epochs.push(epochPnLData);

      return epochPnLData;
    } catch (error) {
      console.error('Error fetching epoch data:', error);
      return undefined;
    }
  }
}
