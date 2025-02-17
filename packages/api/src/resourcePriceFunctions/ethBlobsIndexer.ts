import { resourcePriceRepository } from '../db';
import Sentry from '../sentry';
import { IResourcePriceIndexer } from '../interfaces';
import { Resource } from 'src/models/Resource';
import axios from 'axios';

interface BlobData {
  blobGasPrice: string;
  blobGasUsed: string;
  timestamp: number;
  blockNumber: number;
}

class ethBlobsIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private blobscanApiUrl: string = 'https://api.blobscan.com';
  private retryDelay: number = 1000; // 1 second
  private maxRetries: number = 3;

  private async fetchBlobDataFromBlobscan(
    blockNumber: number,
    retryCount = 0
  ): Promise<BlobData | null> {
    try {
      const response = await axios.get(`${this.blobscanApiUrl}/blocks`, {
        params: {
          startBlock: blockNumber,
          endBlock: blockNumber,
        },
      });

      if (response.data?.blocks?.[0]) {
        const block = response.data.blocks[0];
        const timestamp = Math.floor(
          new Date(block.timestamp).getTime() / 1000
        );

        return {
          blobGasPrice: block.blobGasPrice || '0',
          blobGasUsed: block.blobGasUsed || '0',
          timestamp: timestamp,
          blockNumber: blockNumber,
        };
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Handle rate limiting
        if (error.response?.status === 429 && retryCount < this.maxRetries) {
          console.warn(
            `Rate limited when fetching block ${blockNumber}, retrying in ${this.retryDelay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
          return this.fetchBlobDataFromBlobscan(blockNumber, retryCount + 1);
        }

        // Log specific error details
        Sentry.withScope((scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('status', error.response?.status);
          scope.setExtra('errorMessage', error.message);
          Sentry.captureException(error);
        });
      }
      console.warn(
        `Failed to fetch blob data for block ${blockNumber}:`,
        error
      );
      return null;
    }
  }

  private formatGwei(wei: string): string {
    try {
      return (Number(wei) / 1e9).toFixed(9);
    } catch {
      return '0';
    }
  }

  private async storeBlockPrice(blockNumber: number, resource: Resource) {
    try {
      const blobData = await this.fetchBlobDataFromBlobscan(blockNumber);
      if (!blobData) {
        console.warn(`No blob data for block ${blockNumber}. Skipping block.`);
        return;
      }

      const used = blobData.blobGasUsed;
      const feePaid =
        BigInt(blobData.blobGasPrice) * BigInt(blobData.blobGasUsed);

      const price = {
        resource: { id: resource.id },
        timestamp: blobData.timestamp,
        value: blobData.blobGasPrice,
        used: used,
        feePaid: feePaid.toString(),
        blockNumber: blockNumber,
      };

      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
      console.error('Error storing block price:', error);
      Sentry.withScope((scope) => {
        scope.setExtra('blockNumber', blockNumber);
        scope.setExtra('resource', resource.slug);
        Sentry.captureException(error);
      });
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number
  ): Promise<boolean> {
    try {
      // Get recent blobs to find a reasonable block range
      const response = await axios.get(`${this.blobscanApiUrl}/blobs`, {
        params: {
          ps: 1,
          sort: 'desc',
        },
      });

      if (!response.data?.blobs?.[0]?.blockNumber) {
        console.error('Failed to get recent blob data');
        return false;
      }

      const currentBlockNumber = response.data.blobs[0].blockNumber;
      const startBlock = Math.floor(timestamp / 12); // Approximate block number based on 12s block time

      for (
        let blockNumber = startBlock;
        blockNumber <= currentBlockNumber;
        blockNumber++
      ) {
        try {
          console.log('Indexing blob data from block', blockNumber);
          await this.storeBlockPrice(blockNumber, resource);
        } catch (error) {
          console.error(`Error processing block ${blockNumber}:`, error);
          Sentry.withScope((scope) => {
            scope.setExtra('blockNumber', blockNumber);
            scope.setExtra('resource', resource.slug);
            scope.setExtra('timestamp', timestamp);
            Sentry.captureException(error);
          });
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to index blocks from timestamp:', error);
      return false;
    }
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log('Indexing blob data from block', blockNumber);
        await this.storeBlockPrice(blockNumber, resource);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
        Sentry.withScope((scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('resource', resource.slug);
          Sentry.captureException(error);
        });
      }
    }
    return true;
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log(
        '[EthBlobIndexer] Already watching blocks for resource:',
        resource.slug
      );
      return;
    }

    console.log(
      '[EthBlobIndexer] Starting blob watcher for resource:',
      resource.slug
    );
    this.isWatching = true;
    let lastProcessedBlock = 0;

    const pollNewBlocks = async () => {
      try {
        console.log('[EthBlobIndexer] Polling for new blocks...');

        // Get most recent block
        const response = await axios.get(`${this.blobscanApiUrl}/blocks`, {
          params: {
            ps: 1,
            sort: 'desc',
          },
        });

        if (!response.data?.blocks?.[0]) {
          console.log('[EthBlobIndexer] No new blocks found in this poll');
          return;
        }

        const latestBlock = response.data.blocks[0];
        const currentBlockNumber = latestBlock.number;

        if (currentBlockNumber > lastProcessedBlock) {
          console.log(`[EthBlobIndexer] Found new block ${currentBlockNumber}`);

          try {
            await this.storeBlockPrice(currentBlockNumber, resource);
            const blobData =
              await this.fetchBlobDataFromBlobscan(currentBlockNumber);
            if (blobData) {
              console.log(
                `[EthBlobIndexer] Successfully processed block ${currentBlockNumber}`
              );
            }
            lastProcessedBlock = currentBlockNumber;
          } catch (error) {
            console.error(
              `[EthBlobIndexer] Failed to process block ${currentBlockNumber}:`,
              error
            );
            Sentry.captureException(error);
          }
        } else {
          console.log('[EthBlobIndexer] No new blocks to process');
        }
      } catch (error) {
        console.error('[EthBlobIndexer] Error polling new blocks:', error);
        if (axios.isAxiosError(error)) {
          console.error('[EthBlobIndexer] API Error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
          });
        }
        Sentry.captureException(error);
      }

      // Poll every 12 seconds (average Ethereum block time)
      setTimeout(pollNewBlocks, 12000);
    };

    console.log(
      '[EthBlobIndexer] Starting initial poll for resource:',
      resource.slug
    );
    // Start polling
    pollNewBlocks();
  }
}

export default ethBlobsIndexer;
