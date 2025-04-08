import { TIME_INTERVALS } from 'src/fixtures';
import { startOfCurrentInterval } from './helper';
import { epochRepository, positionRepository } from 'src/db';
import { Position } from 'src/models/Position';
import { getProviderForChain } from 'src/utils';
import { PublicClient } from 'viem';
import { calculateOpenPositionValue } from 'src/helpers/positionPnL';

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
    const currentTimestamp = Date.now() / 1000;
    const datapointTime = startOfCurrentInterval(
      currentTimestamp,
      this.INTERVAL
    );

    let epoch = this.epochs.find(
      (data) =>
        data.epochData.chainId === chainId &&
        data.epochData.address === address.toLowerCase() &&
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
        relations: ['transactions', 'transactions.collateralTransfer'],
      });

      // 2 & 3. Group positions by owner and create PnL entries
      const pnlByOwner = new Map<string, PnLData>();

      const openPositionsOwners = new Map<number, string>();

      for (const position of positions) {
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
        if (position.transactions.length > 0) {
          for (const transaction of position.transactions) {
            if (transaction.collateralTransfer) {
              const collateral = BigInt(
                transaction.collateralTransfer.collateral
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

        // 5. Account for open positions PnL
        if (this.isOpenPosition(position)) {
          if (!openPositionsOwners.has(position.positionId)) {
            openPositionsOwners.set(position.positionId, ownerId);
          }
        }
      }

      // 5.2. Calculate open positions PnL for open positions
      const client = getProviderForChain(Number(epochData.chainId));

      for (const [positionId, ownerId] of openPositionsOwners) {
        const ownerPnl = pnlByOwner.get(ownerId)!;
        const openPositionPnl = await this.getOpenPositionsPnl(
          epochData,
          positionId,
          client
        );
        ownerPnl.openPositionsPnL += openPositionPnl;
        ownerPnl.totalPnL += openPositionPnl;
        pnlByOwner.set(ownerId, ownerPnl);
      }

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
    positionId: number,
    client: PublicClient
  ): Promise<bigint> {
    return calculateOpenPositionValue(positionId, epochData.address, client);
  }

  // TODO: Implement this
  private isOpenPosition(position: Position): boolean {
    // TODO REMOVE THIS, only for lint to be happy
    if (position.id === 999) {
      console.log(` position: ${position.id}`);
    }
    // TODO Check how to identify a position as open
    // TODO: Check if position is settled
    return true;
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
