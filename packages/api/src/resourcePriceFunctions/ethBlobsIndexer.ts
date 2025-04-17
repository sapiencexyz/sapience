import { resourcePriceRepository } from '../db';
import Sentry from '../sentry';
import { IResourcePriceIndexer } from '../interfaces';
import { Resource } from 'src/models/Resource';
import axios from 'axios';
import { getBlockByTimestamp, getProviderForChain, sleep } from 'src/utils';
import { PublicClient } from 'viem';

interface BlobData {
  blobGasPrice: string;
  blobGasUsed: string;
  timestamp: number;
  blockNumber: number;
}

class ethBlobsIndexer implements IResourcePriceIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private blobscanApiUrl: string = 'https://api.blobscan.com';
  private retryDelay: number = 5000;
  private maxRetries: number = Infinity;

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  private async fetchBlobDataFromBlobscan(
    blockNumber: number,
    retryCount = 0
  ): Promise<BlobData | null> {
    try {
      const response = await axios.get(
        `${this.blobscanApiUrl}/blocks/${blockNumber}`
      );

      if (response.data) {
        const block = response.data;
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
          // TODO (Vlad, not urgent): recursion might blow up call stack; rewrite as a while loop
          return this.fetchBlobDataFromBlobscan(blockNumber, retryCount + 1);
        } else if (error.response?.status === 404) {
          console.warn(
            `Seems like no blob data exists for block ${blockNumber}, skipping...`
          );
        } else {
          // Log specific error details
          Sentry.withScope((scope) => {
            scope.setExtra('blockNumber', blockNumber);
            if (error instanceof Error) {
              scope.setExtra('errorMessage', error.message);
            }
            if (error.response && error.response?.status >= 500) {
              scope.setExtra('flakyAPIError', true);
            }
            scope.setExtra('status', error.response?.status);
            Sentry.captureException(error);
          });
        }
      } else {
        console.warn(
          `Failed to fetch blob data for block ${blockNumber}:`,
          error
        );

        // Log specific error details
        Sentry.withScope((scope) => {
          scope.setExtra('blockNumber', blockNumber);
          if (error instanceof Error) {
            scope.setExtra('errorMessage', error.message);
          }
          Sentry.captureException(error);
        });
      }
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

      const feePaid =
        BigInt(blobData.blobGasPrice) * BigInt(blobData.blobGasUsed);

      const price = {
        resource: { id: resource.id },
        timestamp: blobData.timestamp,
        value: blobData.blobGasPrice,
        used: blobData.blobGasUsed,
        feePaid: feePaid.toString(),
        blockNumber: blockNumber,
      };

      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
      console.log(
        `[EthBlobIndexer] Stored block price for block ${blockNumber}`
      );
    } catch (error) {
      console.error('Error storing block price:', error);
      Sentry.withScope((scope) => {
        scope.setExtra('blockNumber', blockNumber);
        scope.setExtra('resource', resource.slug);
        if (error instanceof Error) {
          scope.setExtra('errorMessage', error.message);
        }
        Sentry.captureException(error);
      });
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    try {
      const startBlock = Number(
        (await getBlockByTimestamp(this.client, startTimestamp)).number
      );

      let endBlock: number;

      if (endTimestamp) {
        endBlock = Number(
          (await getBlockByTimestamp(this.client, endTimestamp)).number
        );
      } else {
        const latestBlockNumber = await this.getLatestBlockNumber();
        if (!latestBlockNumber) {
          console.error('Failed to get latest block number');
          return false;
        }
        endBlock = Number(latestBlockNumber);
      }

      if (!startBlock || !endBlock) {
        console.error('Failed to get start or end block');
        return false;
      }

      console.log('[EthBlobIndexer] Start block:', startBlock);
      console.log('[EthBlobIndexer] End block:', endBlock);

      // Process blocks from latest to start
      for (
        let blockNumber = endBlock;
        blockNumber >= startBlock;
        blockNumber--
      ) {
        try {
          const maybeResourcePrice = await resourcePriceRepository.findOne({
            where: {
              resource: { id: resource.id },
              blockNumber,
            },
          });

          if (!overwriteExisting && maybeResourcePrice) {
            console.log('Skipping block', blockNumber, 'as it already exists');
            continue;
          }

          console.log('Indexing blob data from block', blockNumber);
          await this.storeBlockPrice(blockNumber, resource);
        } catch (error) {
          console.error(`Error processing block ${blockNumber}:`, error);
          Sentry.withScope((scope) => {
            scope.setExtra('blockNumber', blockNumber);
            scope.setExtra('resource', resource.slug);
            scope.setExtra('timestamp', startTimestamp);
            if (error instanceof Error) {
              scope.setExtra('errorMessage', error.message);
            }
            Sentry.captureException(error);
          });
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to index blocks from timestamp:', error);
      Sentry.withScope((scope) => {
        scope.setExtra('resource', resource.slug);
        scope.setExtra('startTimestamp', startTimestamp);
        scope.setExtra('endTimestamp', endTimestamp);
        if (error instanceof Error) {
          scope.setExtra('errorMessage', error.message);
          if (axios.isAxiosError(error)) {
            scope.setExtra('status', error.response?.status);
          }
        }
        Sentry.captureException(error);
      });
      return false;
    }
  }

  private async getLatestBlockNumber(): Promise<number | null> {
    let response = null;

    while (!response) {
      try {
        response = await axios.get(`${this.blobscanApiUrl}/blocks`, {
          params: {
            ps: 1,
            sort: 'desc',
          },
        });

        while (!response.data?.blocks?.[0]) {
          console.log('[EthBlobIndexer] No new blocks found in this poll');
          return null;
        }
      } catch (error) {
        response = null;

        Sentry.withScope((scope) => {
          if (error instanceof Error) {
            scope.setExtra('errorMessage', error.message);
          }
          if (axios.isAxiosError(error)) {
            // handle all 500-level HTTP errors by re-requesting data until we have it
            // status code >= 500 <=> flaky API
            if (error.response && error.response?.status >= 500) {
              scope.setExtra('flakyAPIError', true);
            }
            scope.setExtra('status', error.response?.status);
          }
          Sentry.captureException(error);
        });

        sleep(this.retryDelay);
      }
    }

    const latestBlock = response.data.blocks[0];
    return latestBlock.number;
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
          if (error instanceof Error) {
            scope.setExtra('errorMessage', error.message);
            if (axios.isAxiosError(error)) {
              scope.setExtra('status', error.response?.status);
            }
          }
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
        const currentBlockNumber = await this.getLatestBlockNumber();

        if (!currentBlockNumber) {
          console.error('Failed to get latest block number');
          return;
        }

        if (currentBlockNumber > lastProcessedBlock) {
          console.log(`[EthBlobIndexer] Found new block ${currentBlockNumber}`);

          try {
            await this.storeBlockPrice(currentBlockNumber, resource);
            const blobData =
              await this.fetchBlobDataFromBlobscan(currentBlockNumber);
            if (blobData) {
              console.log(
                `[EthBlobIndexer] Successfully processed block ${currentBlockNumber}:`,
                {
                  blockNumber: currentBlockNumber,
                  timestamp: new Date(blobData.timestamp * 1000).toISOString(),
                  blobGasPrice: `${this.formatGwei(blobData.blobGasPrice)} Gwei (${blobData.blobGasPrice} wei)`,
                  blobGasUsed: blobData.blobGasUsed,
                  feePaid: (
                    BigInt(blobData.blobGasPrice) * BigInt(blobData.blobGasUsed)
                  ).toString(),
                }
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
