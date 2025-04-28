import { TIME_INTERVALS } from 'src/fixtures';
import { startOfCurrentInterval } from './helper';
import { marketRepository, positionRepository } from 'src/db';
import { Position } from 'src/models/Position';
import { getProviderForChain } from 'src/utils';
import { PublicClient } from 'viem';
import { calculateOpenPositionValue } from 'src/helpers/positionPnL';
import { getCryptoPrices } from './cachedCryptoPrices';

interface PnLData {
  owner: string;
  positionIds: Set<number>;
  positionCount: number;
  openPositionsPnL: bigint;
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  totalPnL: bigint;
}

interface GlobalPnLData {
  owner: string;
  totalPnL: bigint;
  collateralPnls: CollateralPnLData[];
}

interface CollateralPnLData {
  // Collateral Identification
  collateralAsset: string;
  collateralSymbol: string;
  collateralDecimals: number;
  collateralUnifiedPrice: number;

  // PnL Data
  totalDeposits: bigint;
  totalWithdrawals: bigint;
  openPositionsPnL: bigint;
  totalPnL: bigint;
  positionIds: Set<number>;
  positionCount: number;
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

export class PnLPerformance {
  private static instance: PnLPerformance;
  private INTERVAL = TIME_INTERVALS.intervals.INTERVAL_5_MINUTES;

  private marketsPnlData: MarketPnLData[] = [];
  private globalPnLData: GlobalPnLData[] = [];
  private globalPnLDatapointTime: number = 0;

  private constructor() {
    // Private constructor to prevent direct construction calls with the `new` operator
  }

  public static getInstance(): PnLPerformance {
    if (!PnLPerformance.instance) {
      PnLPerformance.instance = new PnLPerformance();
    }

    return PnLPerformance.instance;
  }

  async getMarketPnLs(chainId: number, address: string, marketId: number) {
    const currentTimestamp = Date.now() / 1000;
    const datapointTime = startOfCurrentInterval(
      currentTimestamp,
      this.INTERVAL
    );

    let marketPnlData = this.marketsPnlData.find(
      (data) =>
        data.marketData.chainId === chainId &&
        data.marketData.address === address.toLowerCase() &&
        data.marketData.marketId === marketId
    );

    if (!marketPnlData) {
      marketPnlData = await this.getMarketData(
        chainId,
        address,
        marketId,
        undefined
      );
      if (!marketPnlData) {
        return [];
      }
    }

    if (marketPnlData.datapointTime === datapointTime) {
      return marketPnlData.pnlData;
    }

    // Build the pnlData array for this market and datapointTime
    marketPnlData.pnlData = await this.buildPnlData(marketPnlData.marketData);
    marketPnlData.datapointTime = datapointTime;

    return marketPnlData.pnlData;
  }

  private async buildPnlData(marketData: MarketData): Promise<PnLData[]> {
    try {
      // 1. Fetch positions for the market
      const positions = await positionRepository.find({
        where: {
          market: { id: marketData.id },
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
      const client = getProviderForChain(Number(marketData.chainId));

      for (const [positionId, ownerId] of openPositionsOwners) {
        const ownerPnl = pnlByOwner.get(ownerId)!;
        const openPositionPnl = await this.getOpenPositionsPnl(
          marketData,
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

  async getGlobalPnLs() {
    const currentTimestamp = Date.now() / 1000;
    const datapointTime = startOfCurrentInterval(
      currentTimestamp,
      this.INTERVAL
    );

    if (this.globalPnLData.length === 0) {
      this.globalPnLData = await this.buildGlobalPnLData(datapointTime);
      this.globalPnLDatapointTime = datapointTime;
    }

    if (this.globalPnLDatapointTime === datapointTime) {
      return this.globalPnLData;
    }

    // Build the pnlData array for this market and datapointTime
    this.globalPnLData = await this.buildGlobalPnLData(datapointTime);
    this.globalPnLDatapointTime = datapointTime;

    return this.globalPnLData;
  }

  private async buildGlobalPnLData(
    datapointTime: number
  ): Promise<GlobalPnLData[]> {
    const globalPnLData: GlobalPnLData[] = [];

    // Get all markets
    const markets = await marketRepository.find({
      relations: ['marketGroup'],
    });

    // Get collateral prices for each collateral symbol
    const collateralPrices: Map<string, number> = new Map();
    for (const market of markets) {
      if (!market.marketGroup.collateralSymbol) {
        console.error(`Collateral symbol not found for market ${market.id}`);
        continue;
      }
      if (collateralPrices.has(market.marketGroup.collateralSymbol)) {
        continue;
      }
      const collateralPrice = await this.getCollateralPrice(
        market.marketGroup.collateralSymbol
      );
      if (!collateralPrice) {
        console.error(
          `Collateral price not found for ${market.marketGroup.collateralSymbol} (market ${market.id})`
        );
        continue;
      }
      collateralPrices.set(
        market.marketGroup.collateralSymbol,
        collateralPrice
      );
    }

    for (const market of markets) {
      // check if there's a valid pnl for this market already calculated, otherwise calculate it

      let marketPnlData = this.marketsPnlData.find(
        (data) =>
          data.marketData.chainId === market.marketGroup.chainId &&
          data.marketData.address ===
            market.marketGroup.address.toLowerCase() &&
          data.marketData.marketId === market.marketId
      );

      if (!marketPnlData) {
        marketPnlData = await this.getMarketData(
          market.marketGroup.chainId,
          market.marketGroup.address.toLowerCase(),
          market.marketId,
          market.id
        );
        if (!marketPnlData) {
          continue;
        }
      }
      if (marketPnlData.datapointTime != datapointTime) {
        marketPnlData.pnlData = await this.buildPnlData(
          marketPnlData.marketData
        );
        marketPnlData.datapointTime = datapointTime;
      }

      // Consolidate each market PnL into the collaterals PnLs for each owner
      for (const pnl of marketPnlData.pnlData) {
        let ownerPnl = globalPnLData.find((p) => p.owner === pnl.owner);
        if (!ownerPnl) {
          ownerPnl = {
            owner: pnl.owner,
            totalPnL: BigInt(0),
            collateralPnls: [],
          };
          globalPnLData.push(ownerPnl);
        }

        const collateralSymbol = market.marketGroup.collateralSymbol;
        const collateralDecimals = market.marketGroup.collateralDecimals || 18;
        const collateralAsset = market.marketGroup.collateralAsset;
        if (!collateralSymbol) {
          console.error(`Collateral symbol not found for market ${market.id}`);
          continue;
        }
        const collateralPrice = collateralPrices.get(collateralSymbol);
        if (!collateralPrice) {
          console.error(
            `Collateral price not found for ${collateralSymbol} (market ${market.id})`
          );
          continue;
        }
        // check if owner exists in globalPnLData
        const escaledTotalPnl = this.getEscaledValue(
          pnl.totalPnL,
          collateralPrice,
          collateralDecimals
        );
        // Totalize the collateral PnLs for each owner
        ownerPnl.totalPnL += escaledTotalPnl; // Use pnl in USD

        // Fill collateral PnL Details for the owner
        // check if collateral exists in ownerPnl
        let collateralPnl = ownerPnl.collateralPnls.find(
          (pnl) =>
            pnl.collateralAsset.toLowerCase() === collateralAsset?.toLowerCase()
        );
        if (!collateralPnl) {
          // Create new collateral PnL
          collateralPnl = {
            collateralAsset: collateralAsset?.toLowerCase() || '',
            collateralSymbol: collateralSymbol,
            collateralDecimals: collateralDecimals,
            collateralUnifiedPrice: collateralPrice,
            totalDeposits: BigInt(0),
            totalWithdrawals: BigInt(0),
            openPositionsPnL: BigInt(0),
            totalPnL: BigInt(0),
            positionIds: new Set(),
            positionCount: 0,
          };
          ownerPnl.collateralPnls.push(collateralPnl);
        }

        // Update collateral PnL
        collateralPnl.totalDeposits += pnl.totalDeposits;
        collateralPnl.totalWithdrawals += pnl.totalWithdrawals;
        collateralPnl.openPositionsPnL += pnl.openPositionsPnL;
        collateralPnl.totalPnL += pnl.totalPnL;
        collateralPnl.positionCount += pnl.positionCount;
        for (const positionId of pnl.positionIds) {
          collateralPnl.positionIds.add(positionId);
        }
      }
    }

    // Return the global PnL data
    return globalPnLData;
  }

  private getEscaledValue(
    value: bigint,
    price: number,
    decimals: number
  ): bigint {
    return (value * BigInt(price * 10 ** decimals)) / BigInt(10 ** decimals);
  }

  private async getCollateralPrice(collateralSymbol: string): Promise<number> {
    const cryptoPrices = await getCryptoPrices();

    if (collateralSymbol === 'wstETH') {
      // Use ETH for wstETH
      if (!cryptoPrices.eth) {
        console.error(`ETH price not found for wstETH`);
        return 1;
      }
      return cryptoPrices.eth;
    }
    if (collateralSymbol === 'sUSDS') {
      // Use 1 for sUSDS
      return 1;
    }

    // Use 1 for all other collateral symbols
    console.error(`Collateral price not found for ${collateralSymbol}`);
    return 1;
  }

  // Helper method to get open positions PnL from contracts
  private async getOpenPositionsPnl(
    marketData: MarketData,
    positionId: number,
    client: PublicClient
  ): Promise<bigint> {
    return calculateOpenPositionValue(positionId, marketData.address, client);
  }

  private isOpenPosition(position: Position): boolean {
    if (position.isSettled) {
      return false;
    }

    if (position.baseToken === '0' && position.borrowedBaseToken === '0') {
      return false;
    }

    // baseToken - borrowedBaseToken == 0
    if (position.baseToken === position.borrowedBaseToken) {
      return false;
    }

    console.log(
      `  calculating PNL -> position: ${position.id} is open, baseToken: ${position.baseToken}, borrowedBaseToken: ${position.borrowedBaseToken}`
    );
    return true;
  }

  private async getMarketData(
    chainId: number,
    address: string,
    marketId: number,
    marketIndex: number | undefined
  ): Promise<MarketPnLData | undefined> {
    try {
      if (!marketIndex) {
        const market = await marketRepository.findOne({
          where: {
            marketGroup: {
              chainId,
              address: address.toLowerCase(),
            },
            marketId: Number(marketId),
          },
        });

        if (!market) {
          return undefined;
        }
        marketIndex = market.id;
      }

      const marketPnLData: MarketPnLData = {
        marketData: {
          id: marketIndex,
          chainId,
          address,
          marketId: marketId,
        },
        pnlData: [],
        datapointTime: 0,
      };

      this.marketsPnlData.push(marketPnLData);

      return marketPnLData;
    } catch (error) {
      console.error('Error fetching market data:', error);
      return undefined;
    }
  }
}
