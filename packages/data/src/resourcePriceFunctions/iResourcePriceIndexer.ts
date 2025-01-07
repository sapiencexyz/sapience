import { Market } from "../models/Market";

export interface IResourcePriceIndexer {
  indexBlockPriceFromTimestamp(
    market: Market,
    timestamp: number
  ): Promise<boolean>;
  indexBlocks(market: Market, blocks: number[]): Promise<boolean>;
  watchBlocksForMarket(market: Market): void;
}
