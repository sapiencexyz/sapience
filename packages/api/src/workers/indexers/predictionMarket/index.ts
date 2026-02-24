import { getProviderForChain, getBlockByTimestamp } from '../../../utils/utils';
import {
  type PublicClient,
  type Log,
  type Block,
  keccak256,
  toHex,
} from 'viem';
import Sentry from '../../../instrument';
import { IIndexer } from '../../../interfaces';
import {
  lzConditionalTokenResolverAbi,
  liquidityVaultAbi,
} from '@sapience/sdk/abis';
import { predictionMarket, lzPMResolver, lzUmaResolver } from '@sapience/sdk';
import {
  predictionMarketLZConditionalTokensResolver,
  passiveLiquidityVault,
} from '@sapience/sdk/contracts';

import { BLOCK_BATCH_SIZE, PREDICTION_MARKET_ABI } from './constants';
import type { HandlerContext } from './handlerContext';
import {
  processPredictionMinted,
  processPredictionBurned,
  processPredictionConsolidated,
  processOrderPlaced,
  processOrderFilled,
  processOrderCancelled,
  processMarketResolved,
  processMarketSubmittedToUMA,
  processConditionResolved,
  processPendingRequestProcessed,
} from './handlers';

class PredictionMarketIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private resolverAddress: `0x${string}` | undefined;
  private lzConditionalTokenResolverAddress: `0x${string}` | undefined;
  private vaultAddress: `0x${string}` | undefined;
  private sigintHandler: (() => void) | null = null;
  private currentUnwatch: (() => void) | null = null;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    // Get the contract address for this specific chain
    const contractEntry = predictionMarket[chainId];
    if (!contractEntry?.address) {
      throw new Error(
        `PredictionMarket contract not deployed on chain ${chainId}. Available chains: ${Object.keys(predictionMarket).join(', ')}`
      );
    }
    this.contractAddress = contractEntry.address as `0x${string}`;

    // Get the resolver address if available
    const pmResolverEntry = lzPMResolver[chainId as keyof typeof lzPMResolver];
    const umaResolverEntry =
      lzUmaResolver[chainId as keyof typeof lzUmaResolver];

    if (pmResolverEntry?.address) {
      this.resolverAddress = pmResolverEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found PM resolver address for chain ${chainId}: ${this.resolverAddress}`
      );
    } else if (umaResolverEntry?.address) {
      this.resolverAddress = umaResolverEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found UMA resolver address for chain ${chainId}: ${this.resolverAddress}`
      );
    }

    // Get the LZ Conditional Token Resolver address if available
    const lzConditionalTokenResolverEntry =
      predictionMarketLZConditionalTokensResolver[
        chainId as keyof typeof predictionMarketLZConditionalTokensResolver
      ];
    if (lzConditionalTokenResolverEntry?.address) {
      this.lzConditionalTokenResolverAddress =
        lzConditionalTokenResolverEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found LZ Conditional Token Resolver address for chain ${chainId}: ${this.lzConditionalTokenResolverAddress}`
      );
    }

    // Get the vault address for flow event indexing
    const vaultEntry =
      passiveLiquidityVault[chainId as keyof typeof passiveLiquidityVault];
    if (vaultEntry?.address) {
      this.vaultAddress = vaultEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found vault address for chain ${chainId}: ${this.vaultAddress}`
      );
    }
  }

  private get handlerContext(): HandlerContext {
    return {
      chainId: this.chainId,
      contractAddress: this.contractAddress,
    };
  }

  // Thin delegating methods so existing callers (including tests) that invoke
  // these as instance methods continue to work.
  private async processPredictionMinted(log: Log, block: Block): Promise<void> {
    return processPredictionMinted(this.handlerContext, log, block);
  }
  private async processPredictionBurned(log: Log, block: Block): Promise<void> {
    return processPredictionBurned(this.handlerContext, log, block);
  }
  private async processPredictionConsolidated(
    log: Log,
    block: Block
  ): Promise<void> {
    return processPredictionConsolidated(this.handlerContext, log, block);
  }
  private async processOrderPlaced(log: Log, block: Block): Promise<void> {
    return processOrderPlaced(this.handlerContext, log, block);
  }
  private async processOrderFilled(log: Log, block: Block): Promise<void> {
    return processOrderFilled(this.handlerContext, log, block);
  }
  private async processOrderCancelled(log: Log, block: Block): Promise<void> {
    return processOrderCancelled(this.handlerContext, log, block);
  }
  private async processMarketResolved(log: Log, block: Block): Promise<void> {
    return processMarketResolved(this.handlerContext, log, block);
  }
  private async processMarketSubmittedToUMA(
    log: Log,
    block: Block
  ): Promise<void> {
    return processMarketSubmittedToUMA(this.handlerContext, log, block);
  }
  private async processConditionResolved(
    log: Log,
    block: Block
  ): Promise<void> {
    return processConditionResolved(this.handlerContext, log, block);
  }
  private async processPendingRequestProcessed(
    log: Log,
    block: Block
  ): Promise<void> {
    return processPendingRequestProcessed(this.handlerContext, log, block);
  }

  private getAddresses(): `0x${string}`[] {
    const addresses: `0x${string}`[] = [this.contractAddress as `0x${string}`];
    if (this.resolverAddress) {
      addresses.push(this.resolverAddress as `0x${string}`);
    }
    if (this.lzConditionalTokenResolverAddress) {
      addresses.push(this.lzConditionalTokenResolverAddress as `0x${string}`);
    }
    if (this.vaultAddress) {
      addresses.push(this.vaultAddress as `0x${string}`);
    }
    return addresses;
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      const addressesInfo = this.resolverAddress
        ? `contracts ${this.contractAddress} and resolver ${this.resolverAddress}`
        : `contract ${this.contractAddress}`;
      console.log(
        `[PredictionMarketIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on ${addressesInfo}`
      );

      // Use binary search to find the exact blocks for the timestamps
      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(
        `[PredictionMarketIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[PredictionMarketIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        // If no end timestamp provided, use the latest block
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[PredictionMarketIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      }

      // Create array of block numbers to index
      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);
      const blockNumbers: number[] = [];

      // Process blocks in batches to avoid overwhelming the RPC
      for (
        let i = startBlockNumber;
        i <= endBlockNumber;
        i += BLOCK_BATCH_SIZE
      ) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        const batch = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        blockNumbers.push(...batch);
      }

      console.log(
        `[PredictionMarketIndexer] Indexing ${blockNumbers.length} blocks from ${startBlockNumber} to ${endBlockNumber}`
      );
      return await this.indexBlocks(resourceSlug, blockNumbers);
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error indexing from timestamp:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  async indexBlocks(_resourceSlug: string, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Indexing ${blocks.length} blocks: ${blocks[0]} to ${blocks[blocks.length - 1]}`
      );

      // For reindexing large ranges, use optimized batch processing
      if (blocks.length > 1000) {
        return await this.indexBlocksOptimized(blocks);
      }

      for (const blockNumber of blocks) {
        await this.indexBlock(blockNumber);
      }

      return true;
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error indexing blocks:', error);
      Sentry.captureException(error);
      return false;
    }
  }

  private async indexBlocksOptimized(blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Using optimized batch processing for ${blocks.length} blocks`
      );

      const CHUNK_SIZE = 10000;
      let processedBlocks = 0;

      for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunk = blocks.slice(i, i + CHUNK_SIZE);
        const fromBlock = chunk[0];
        const toBlock = chunk[chunk.length - 1];

        console.log(
          `[PredictionMarketIndexer] Processing chunk: blocks ${fromBlock} to ${toBlock} (${chunk.length} blocks)`
        );

        try {
          const addresses = this.getAddresses();
          const logs = await this.client.getLogs({
            address: addresses,
            fromBlock: BigInt(fromBlock),
            toBlock: BigInt(toBlock),
          });

          console.log(
            `[PredictionMarketIndexer] Found ${logs.length} logs in chunk ${fromBlock}-${toBlock}`
          );

          // Process all logs in this chunk
          for (const log of logs) {
            try {
              // Get block info only when we have a relevant log
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber!,
                includeTransactions: false,
              });
              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
              Sentry.captureException(logError);
              // Continue processing other logs
            }
          }

          processedBlocks += chunk.length;
          console.log(
            `[PredictionMarketIndexer] Progress: ${processedBlocks}/${blocks.length} blocks (${Math.round((processedBlocks / blocks.length) * 100)}%)`
          );
        } catch (chunkError) {
          console.error(
            `[PredictionMarketIndexer] Error processing chunk ${fromBlock}-${toBlock}:`,
            chunkError
          );
          Sentry.captureException(chunkError);

          // fallback
          console.log(
            `[PredictionMarketIndexer] Falling back to individual block processing for chunk ${fromBlock}-${toBlock}`
          );
          for (const blockNumber of chunk) {
            await this.indexBlock(blockNumber);
          }
          processedBlocks += chunk.length;
        }
      }

      return true;
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error in optimized indexing:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  private async indexBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
      });

      const addresses = this.getAddresses();
      const logs = await this.client.getLogs({
        address: addresses,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        try {
          await this.processLog(log, block);
        } catch (logError) {
          console.error(
            `[PredictionMarketIndexer] Error processing individual log in indexBlock:`,
            logError
          );
          Sentry.captureException(logError);
          // Continue processing other logs
        }
      }
    } catch (error) {
      console.error(
        `[PredictionMarketIndexer] Error indexing block ${blockNumber}:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      console.log(
        `[PredictionMarketIndexer] Processing log: ${log.address} logIndex: ${log.logIndex}`
      );
      // Check if this is a PredictionMarket event
      const addressesToCheck = [this.contractAddress];
      if (this.resolverAddress) {
        addressesToCheck.push(this.resolverAddress);
      }
      if (this.lzConditionalTokenResolverAddress) {
        addressesToCheck.push(this.lzConditionalTokenResolverAddress);
      }
      if (this.vaultAddress) {
        addressesToCheck.push(this.vaultAddress);
      }

      if (
        !addressesToCheck
          .map((a) => a.toLowerCase())
          .includes(log.address.toLowerCase())
      ) {
        console.log(
          `[PredictionMarketIndexer] Skipping log: ${log.address} is not the PredictionMarket, Resolver, or Vault contract`
        );
        return;
      }

      // Decode the event based on the topic
      const predictionMintedTopic = keccak256(
        toHex(
          'PredictionMinted(address,address,bytes,uint256,uint256,uint256,uint256,uint256,bytes32)'
        )
      );
      const predictionBurnedTopic = keccak256(
        toHex(
          'PredictionBurned(address,address,bytes,uint256,uint256,uint256,bool,bytes32)'
        )
      );
      const predictionConsolidatedTopic = keccak256(
        toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)')
      );
      const orderPlacedTopic = keccak256(
        toHex(
          'OrderPlaced(address,uint256,bytes,address,uint256,uint256,bytes32)'
        )
      );
      const orderFilledTopic = keccak256(
        toHex(
          'OrderFilled(uint256,address,address,bytes,uint256,uint256,bytes32)'
        )
      );
      const orderCancelledTopic = keccak256(
        toHex('OrderCancelled(uint256,address,bytes,uint256,uint256)')
      );
      const marketResolvedTopic = keccak256(
        toHex('MarketResolved(bytes32,bool,bool,uint256)')
      );
      const marketSubmittedToUMATopic = keccak256(
        toHex('MarketSubmittedToUMA(bytes32,bytes32,address,bytes,bool)')
      );
      const conditionResolvedTopic = keccak256(
        toHex(
          'ConditionResolved(bytes32,bool,bool,uint256,uint256,uint256,uint256)'
        )
      );
      const pendingRequestProcessedTopic = keccak256(
        toHex('PendingRequestProcessed(address,bool,uint256,uint256)')
      );

      if (log.topics[0] === predictionMintedTopic) {
        await this.processPredictionMinted(log, block);
      } else if (log.topics[0] === predictionBurnedTopic) {
        await this.processPredictionBurned(log, block);
      } else if (log.topics[0] === predictionConsolidatedTopic) {
        await this.processPredictionConsolidated(log, block);
      } else if (log.topics[0] === orderPlacedTopic) {
        await this.processOrderPlaced(log, block);
      } else if (log.topics[0] === orderFilledTopic) {
        await this.processOrderFilled(log, block);
      } else if (log.topics[0] === orderCancelledTopic) {
        await this.processOrderCancelled(log, block);
      } else if (log.topics[0] === marketResolvedTopic) {
        await this.processMarketResolved(log, block);
      } else if (log.topics[0] === marketSubmittedToUMATopic) {
        await this.processMarketSubmittedToUMA(log, block);
      } else if (log.topics[0] === conditionResolvedTopic) {
        await this.processConditionResolved(log, block);
      } else if (log.topics[0] === pendingRequestProcessedTopic) {
        await this.processPendingRequestProcessed(log, block);
      }
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing log:', error);
      Sentry.captureException(error);
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[PredictionMarketIndexer:${this.chainId}] Already watching events`
      );
      return;
    }

    // Clean up any existing watcher before creating a new one
    if (this.currentUnwatch) {
      try {
        console.log('[PredictionMarketIndexer] Cleaning up existing watcher');
        this.currentUnwatch();
      } catch (error) {
        console.error(
          '[PredictionMarketIndexer] Error cleaning up old watcher:',
          error
        );
      }
      this.currentUnwatch = null;
    }

    // Remove any existing SIGINT listener
    if (this.sigintHandler) {
      console.log(
        '[PredictionMarketIndexer] Removing existing SIGINT listener'
      );
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }

    this.isWatching = true;
    console.log(
      `[PredictionMarketIndexer:${this.chainId}] Starting to watch events for resource: ${resourceSlug} on contract ${this.contractAddress}`
    );

    try {
      const addresses = [this.contractAddress];
      if (this.resolverAddress) {
        addresses.push(this.resolverAddress);
      }
      if (this.lzConditionalTokenResolverAddress) {
        addresses.push(this.lzConditionalTokenResolverAddress);
      }
      if (this.vaultAddress) {
        addresses.push(this.vaultAddress);
      }

      // Combined ABI for watching all relevant events
      const combinedAbi = [
        ...PREDICTION_MARKET_ABI,
        ...lzConditionalTokenResolverAbi,
        ...liquidityVaultAbi,
      ];

      // Watch for all PredictionMarket events in a single watcher
      this.currentUnwatch = this.client.watchContractEvent({
        address: addresses,
        abi: combinedAbi,
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              // Get the block for timestamp information
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber,
                includeTransactions: false,
              });

              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
            }
          }
        },
        onError: (error) => {
          console.error(
            '[PredictionMarketIndexer] Error watching events:',
            error
          );
          Sentry.captureException(error);
          this.isWatching = false;

          // Clean up the failed watcher for non-EtherealChain only - Ethereal doesn't rate limit but is flaky
          if (this.currentUnwatch && this.chainId !== 5064014) {
            try {
              console.log(
                '[PredictionMarketIndexer] Cleaning up failed watcher'
              );
              this.currentUnwatch();
            } catch (cleanupError) {
              console.error(
                '[PredictionMarketIndexer] Error cleaning up failed watcher:',
                cleanupError
              );
            }
            this.currentUnwatch = null;
          }

          // Attempt to restart after a delay
          console.log(
            '[PredictionMarketIndexer] Attempting to restart in 10 seconds...'
          );
          setTimeout(() => {
            if (!this.isWatching) {
              console.log(
                '[PredictionMarketIndexer] Restarting event watcher...'
              );
              this.watchBlocksForResource(resourceSlug).catch(
                (restartError: Error) => {
                  console.error(
                    '[PredictionMarketIndexer] Failed to restart:',
                    restartError
                  );
                  Sentry.captureException(restartError);
                }
              );
            }
          }, 10000);
        },
      });

      // Keep the process alive
      this.sigintHandler = () => {
        console.log('[PredictionMarketIndexer] Stopping event watcher...');
        if (this.currentUnwatch) {
          this.currentUnwatch();
          this.currentUnwatch = null;
        }
        this.isWatching = false;
        if (this.sigintHandler) {
          process.removeListener('SIGINT', this.sigintHandler);
          this.sigintHandler = null;
        }
        process.exit(0);
      };
      console.log('[PredictionMarketIndexer] Adding SIGINT listener');
      process.on('SIGINT', this.sigintHandler);

      // Keep the process running
      await new Promise(() => {});
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error starting event watchers:',
        error
      );
      Sentry.captureException(error);
      this.isWatching = false;
    }
  }
}

export default PredictionMarketIndexer;
