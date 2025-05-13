import { MarketGroup } from 'src/models/MarketGroup';

export interface MarketInfo {
  resourceSlug: string;
  marketGroupIdx: number;
  marketIdx: number;
  marketId: number;
  marketGroupAddress: string;
  marketGroupChainId: number;
  startTimestamp: number;
  endTimestamp: number;
  isCumulative: boolean;
}

export class MarketInfoStore {
  private static instance: MarketInfoStore;
  private marketInfoByIdx: Map<number, MarketInfo> = new Map();

  private constructor() {}

  public static getInstance() {
    if (!this.instance) {
      this.instance = new MarketInfoStore();
    }
    return this.instance;
  }

  public async updateMarketInfo(marketGroups: MarketGroup[]) {
    for (const marketGroup of marketGroups) {
      // Add resource slug
      const resourceSlug = marketGroup.resource
        ? marketGroup.resource.slug
        : 'no-resource';

      // Add market with extra data
      if (marketGroup.markets) {
        for (const market of marketGroup.markets) {
          if (this.marketInfoByIdx.has(market.id)) {
            continue;
          }
          this.marketInfoByIdx.set(market.id, {
            marketId: market.marketId,
            marketGroupIdx: marketGroup.id,
            marketIdx: market.id,
            resourceSlug,
            marketGroupAddress: marketGroup.address,
            marketGroupChainId: marketGroup.chainId,
            startTimestamp: market.startTimestamp ?? 0,
            endTimestamp: market.endTimestamp ?? 0,
            isCumulative: marketGroup.isCumulative ?? false,
          });
        }
      }
    }
  }

  public getMarketInfo(marketId: number): MarketInfo | undefined {
    return this.marketInfoByIdx.get(marketId);
  }

  public getMarketInfoByChainAndAddress(chainId: number, address: string, marketId: string): MarketInfo | undefined {
    for (const marketInfo of this.marketInfoByIdx.values()) {
      if (
        marketInfo.marketGroupChainId === chainId &&
        marketInfo.marketGroupAddress.toLowerCase() === address.toLowerCase() &&
        marketInfo.marketId === Number(marketId)
      ) {
        return marketInfo;
      }
    }
    return undefined;
  }

  public getAllMarketIndexes(): number[] {
    return Array.from(this.marketInfoByIdx.keys());
  }

  public getAllResourceSlugs(): string[] {
    return Array.from(this.marketInfoByIdx.values()).map((m) => m.resourceSlug);
  }

  public isMarketActive(marketId: number, timestamp: number): boolean {
    const marketInfo = this.marketInfoByIdx.get(marketId);
    if (!marketInfo) return false;
    
    return timestamp >= marketInfo.startTimestamp && 
      (marketInfo.endTimestamp === 0 || timestamp <= marketInfo.endTimestamp);
  }

  public getActiveMarkets(timestamp: number): number[] {
    return this.getAllMarketIndexes().filter(marketId => 
      this.isMarketActive(marketId, timestamp)
    );
  }
} 