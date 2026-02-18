import type { PublicClient } from 'viem';

export interface IIndexer {
  client?: PublicClient;
  indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting?: boolean
  ): Promise<boolean>;
  indexBlocks(resourceSlug: string, blocks: number[]): Promise<boolean>;
  watchBlocksForResource(resourceSlug: string): Promise<void>;
}
