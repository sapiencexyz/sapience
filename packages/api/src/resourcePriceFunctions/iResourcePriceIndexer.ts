import type { Resource } from "../models/Resource";

import type { PublicClient } from "viem";

export interface IResourcePriceIndexer {
  client: PublicClient | undefined;
  indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number,
  ): Promise<boolean>;
  indexBlocks(resource: Resource, blocks: number[]): Promise<boolean>;
  watchBlocksForResource(resource: Resource): Promise<void>;
}
