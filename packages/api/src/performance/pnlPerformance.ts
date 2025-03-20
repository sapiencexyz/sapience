import { TIME_INTERVALS } from 'src/fixtures';
import { startOfCurrentInterval } from './helper';
import { epochRepository, positionRepository } from 'src/db';

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

export class PnLPerformance {
  private static instance: PnLPerformance;
  private INTERVAL = TIME_INTERVALS.intervals.INTERVAL_5_MINUTES;

  private epochs: EpochPnLData[] = [];

  private constructor() {
    // Private constructor to prevent direct construction calls with the `new` operator
  }

  public static getInstance(): PnLPerformance {
    if (!PnLPerformance.instance) {
      PnLPerformance.instance = new PnLPerformance();
    }

    return PnLPerformance.instance;
  }

  async getEpochPnLs(chainId: number, address: string, epochId: number) {
    const currentTimestamp = Date.now();
    const datapointTime = startOfCurrentInterval(
      currentTimestamp,
      this.INTERVAL
    );

    let epoch = this.epochs.find(
      (data) =>
        data.epochData.chainId === chainId &&
        data.epochData.address === address &&
        data.epochData.epochId === epochId
    );

    if (!epoch) {
      epoch = await this.getEpochData(chainId, address, epochId);
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
      const positions = await positionRepository.find({
        where: {
          epoch: { id: epochData.id },
        },
        relations: ['Transaction', 'ColalteralTransfer'],
      });

      // 2 & 3. Group positions by owner and create PnL entries
      const pnlByOwner = new Map<string, PnLData>();

      const openPositionsOwners = new Map<number, string>();

      for (const position of positions) {
        const ownerId = position.owner;

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
        if (!ownerPnl.positionIds.has(position.id)) {
          ownerPnl.positionCount++;
          ownerPnl.positionIds.add(position.id);
        }

        // 4. Account for collateral changes
        if (position.transactions.length > 0) {
          for (const transaction of position.transactions) {
            if (transaction.collateralTransfer) {
              const collateral = BigInt(
                transaction.collateralTransfer.collateral
              );
              if (collateral > BigInt(0)) {
                ownerPnl.totalDeposits += collateral;
              } else {
                ownerPnl.totalWithdrawals += collateral;
              }
            }
          }
        }

        // 5. Account for open positions PnL
        // TODO Check how to identify a position as open
        if (!openPositionsOwners.has(position.id)) {
          openPositionsOwners.set(position.id, ownerId);
        }

        // 5.1. TODO Do we need to account for "position.collateral" here?
      }

      // 5.2. Calculate open positions PnL for open positions
      openPositionsOwners.forEach(async (ownerId, positionId) => {
        const ownerPnl = pnlByOwner.get(ownerId)!;
        ownerPnl.openPositionsPnL = await this.getOpenPositionsPnl(
          epochData,
          positionId
        );
      });

      // 6. Return the PnL data array
      return Array.from(pnlByOwner.values());
    } catch (error) {
      console.error(`Error building PnL data: ${error}`);
      return [];
    }
  }

  // Helper method to get open positions PnL from contracts
  private async getOpenPositionsPnl(
    epochData: EpochData,
    positionId: number
  ): Promise<bigint> {
    // TODO: Remove this, it's just here for lint to pass
    if (positionId === 99) {
      console.log(epochData);
      console.log(positionId);
    }
    // Implement contract interaction here
    // This is a placeholder - you'll need to implement based on your contract structure
    return BigInt(0);
  }

  private async getEpochData(
    chainId: number,
    address: string,
    epochId: number
  ): Promise<EpochPnLData | undefined> {
    try {
      const epoch = await epochRepository.findOne({
        where: {
          market: {
            chainId,
            address: address.toLowerCase(),
          },
          epochId: Number(epochId),
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
          epochId,
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
