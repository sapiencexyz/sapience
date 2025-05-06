import { resourcePriceRepository } from '../../db';
import { getBlockByTimestamp, getProviderForChain } from '../../utils/utils';
import { Block, type PublicClient } from 'viem';
import Sentry from '../../instrument';
import { IResourcePriceIndexer } from '../../interfaces';
import { Resource } from '../../models/Resource';

class EvmIndexer implements IResourcePriceIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  private async storeBlockPrice(block: Block, resource: Resource) {
    const value = block?.baseFeePerGas; // in wei
    const used = block?.gasUsed;
    if (!value || !block.number) {
      console.warn(
        `[EvmIndexer.${resource.slug}] No baseFeePerGas for block ${block?.number} on resource ${resource.slug}. Skipping block.`
      );
      return;
    }
    try {
      const feePaid = BigInt(value) * BigInt(used);
      const price = {
        resource: { id: resource.id },
        timestamp: Number(block.timestamp),
        value: value.toString(),
        used: used.toString(),
        feePaid: feePaid.toString(),
        blockNumber: Number(block.number),
      };
      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
      console.error(
        `[EvmIndexer.${resource.slug}] Error storing block price:`,
        error
      );
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    const initalBlock = await getBlockByTimestamp(this.client, timestamp);
    if (!initalBlock.number) {
      throw new Error('No block found at timestamp');
    }

    let endBlock;
    if (endTimestamp) {
      endBlock = await getBlockByTimestamp(this.client, endTimestamp);
      if (!endBlock.number) {
        throw new Error('No block found at end timestamp');
      }
    } else {
      endBlock = await this.client.getBlock();
    }

    if (!endBlock.number) {
      throw new Error('No end block number found');
    }

    for (
      let blockNumber = endBlock.number;
      blockNumber >= initalBlock.number;
      blockNumber--
    ) {
      try {
        // Check if we already have a price for this block
        const existingPrice = await resourcePriceRepository.findOne({
          where: {
            resource: { id: resource.id },
            blockNumber: Number(blockNumber),
          },
        });

        if (!overwriteExisting && existingPrice) {
          console.log(
            `[EvmIndexer.${resource.slug}] Already have price for block ${blockNumber}, skipping...`
          );
          continue;
        }

        console.log(
          `[EvmIndexer.${resource.slug}] Indexing gas from block`,
          blockNumber.toString()
        );

        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('resource', resource.slug);
          scope.setExtra('timestamp', timestamp);
          Sentry.captureException(error);
        });
        console.error(
          `[EvmIndexer.${resource.slug}] Error processing block ${blockNumber}:`,
          error
        );
      }
    }
    return true;
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log(
          `[EvmIndexer.${resource.slug}] Indexing gas from block`,
          blockNumber
        );
        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('resource', resource.slug);
          Sentry.captureException(error);
        });
        console.error(
          `[EvmIndexer.${resource.slug}] Error processing block ${blockNumber}:`,
          error
        );
      }
    }
    return true;
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log(
        `[EvmIndexer.${resource.slug}] Already watching blocks for this resource`
      );
      return;
    }
    // suggested using a watch some re-connectiong logic if the watcher crashes. and attempts to reconnect.
    const startWatching = () => {
      console.log(
        `[EvmIndexer.${resource.slug}] Watching base fee per gas on chain ID ${this.client.chain?.id}`
      );

      this.isWatching = true;

      const unwatch = this.client.watchBlocks({
        onBlock: async (block) => {
          try {
            await this.storeBlockPrice(block, resource);
            console.log(
              `[EvmIndexer.${resource.slug}] Successfully processed block ${block.number}`
            );
            this.reconnectAttempts = 0;
          } catch (error) {
            console.error(
              `[EvmIndexer.${resource.slug}] Error processing block:`,
              error
            );
          }
        },
        onError: (error) => {
          Sentry.withScope((scope: Sentry.Scope) => {
            scope.setExtra('resource', resource.slug);
            scope.setExtra('chainId', this.client.chain?.id);
            Sentry.captureException(error);
          });

          this.isWatching = false;
          unwatch?.();

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
              `[EvmIndexer.${resource.slug}] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
            );
            setTimeout(() => {
              startWatching();
            }, this.reconnectDelay);
          } else {
            console.error(
              `[EvmIndexer.${resource.slug}] Max reconnection attempts reached. Stopping watch.`
            );
            Sentry.captureMessage(
              'Max reconnection attempts reached for block watcher'
            );
          }
        },
      });
    };

    startWatching();
  }
}

export default EvmIndexer;
