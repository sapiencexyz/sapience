import { MarketGroup } from 'src/models/MarketGroup';

export interface MarketInfo {
  resourceSlug: string;
  marketGroupIdx: number;
  marketId: number;
  marketGroupAddress: string;
  marketGroupChainId: number;
  startTimestamp: number;
  endTimestamp: number;
}

export class MarketInfoStore {
  private static instance: MarketInfoStore;
  private marketInfoById: Map<number, MarketInfo> = new Map();

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
          if (this.marketInfoById.has(market.id)) {
            continue;
          }
          this.marketInfoById.set(market.id, {
            marketId: market.marketId,
            marketGroupIdx: marketGroup.id,
            resourceSlug,
            marketGroupAddress: marketGroup.address,
            marketGroupChainId: marketGroup.chainId,
            startTimestamp: market.startTimestamp ?? 0,
            endTimestamp: market.endTimestamp ?? 0,
          });
        }
      }
    }
  }

  public getMarketInfo(marketId: number): MarketInfo | undefined {
    return this.marketInfoById.get(marketId);
  }

  public getAllMarketIds(): number[] {
    return Array.from(this.marketInfoById.keys());
  }

  public getAllResourceSlugs(): string[] {
    return Array.from(this.marketInfoById.values()).map((m) => m.resourceSlug);
  }

  public isMarketActive(marketId: number, timestamp: number): boolean {
    const marketInfo = this.marketInfoById.get(marketId);
    if (!marketInfo) return false;
    
    return timestamp >= marketInfo.startTimestamp && 
      (marketInfo.endTimestamp === 0 || timestamp <= marketInfo.endTimestamp);
  }

  public getActiveMarkets(timestamp: number): number[] {
    return this.getAllMarketIds().filter(marketId => 
      this.isMarketActive(marketId, timestamp)
    );
  }
} 