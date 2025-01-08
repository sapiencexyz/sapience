import { Market } from "../models/Market";
import { Resource } from "../models/Resource";

export interface IResourcePriceIndexer {
  indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number
  ): Promise<boolean>;
  indexBlocks(resource: Resource, blocks: number[]): Promise<boolean>;
  watchBlocksForResource(resource: Resource): void;
}
