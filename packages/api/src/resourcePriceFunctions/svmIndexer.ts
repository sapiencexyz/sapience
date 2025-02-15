import { resourcePriceRepository } from '../db';
import { Connection } from '@solana/web3.js';
import Sentry from '../sentry';
import { IResourcePriceIndexer } from '../interfaces';
import { Resource } from 'src/models/Resource';
import type { Scope } from '@sentry/node';

interface SolanaBlock {
  blockhash: string;
  parentSlot: number;
  blockTime: number | null;
  slot: number;
  transactions: Array<{
    meta: {
      fee: number;
      computeUnitsConsumed?: number;
    };
  }>;
}

class SvmIndexer implements IResourcePriceIndexer {
  private connection: Connection;
  private isWatching: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds
  private processedSlots: Set<number> = new Set(); // Track processed slots
  private processingSlots: Set<number> = new Set(); // Track slots currently being processed

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'finalized');
  }

  private async storeBlockPrice(block: SolanaBlock, resource: Resource) {
    if (!block || !block.transactions) {
      console.warn(
        `Invalid block data for resource ${resource.slug}. Skipping block.`
      );
      return;
    }

    // Check if we've already processed this slot
    if (this.processedSlots.has(block.slot)) {
      return;
    }

    try {
      let totalComputeUnits = 0n;
      let totalFees = 0n;

      for (const tx of block.transactions) {
        if (tx.meta) {
          const computeUnits = BigInt(tx.meta.computeUnitsConsumed || 0);
          const fee = BigInt(tx.meta.fee || 0);

          totalComputeUnits += computeUnits;
          totalFees += fee;
        }
      }

      // Skip if no transactions or compute units
      if (totalComputeUnits === 0n || block.transactions.length === 0) {
        console.log(
          `Block ${block.slot}: No compute units or transactions found`
        );
        return;
      }

      // Calculate average fee per compute unit (in lamports) with 9 decimal places
      const avgFeePerCU = (
        (totalFees * 10n ** 9n) /
        totalComputeUnits
      ).toString();

      console.log(
        `Block ${block.slot} (${block.blockTime}): ${totalComputeUnits} CU, ${totalFees} lamports, fee/CU: ${avgFeePerCU}`
      );

      const price = {
        resource: { id: resource.id },
        timestamp: block.blockTime
          ? Number(block.blockTime)
          : Math.floor(Date.now() / 1000),
        value: avgFeePerCU,
        used: totalComputeUnits.toString(),
        feePaid: totalFees.toString(),
        blockNumber: block.slot,
      };

      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);

      // Mark slot as processed and remove from processing
      this.processedSlots.add(block.slot);
      this.processingSlots.delete(block.slot);

      // Maintain a reasonable size for the processed slots set
      if (this.processedSlots.size > 1000) {
        const oldestSlots = Array.from(this.processedSlots).slice(0, 500);
        oldestSlots.forEach((slot) => this.processedSlots.delete(slot));
      }
    } catch (error) {
      this.processingSlots.delete(block.slot);
      console.error('Error storing block price:', error);
      throw error;
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number
  ): Promise<boolean> {
    try {
      // Get blocks from timestamp
      const slots = await this.connection.getBlocks(timestamp);

      for (const slot of slots) {
        const block = await this.connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
          rewards: false,
        });

        if (block) {
          await this.storeBlockPrice(
            { ...block, slot } as SolanaBlock,
            resource
          );
        }
      }
      return true;
    } catch (error) {
      Sentry.withScope((scope: Scope) => {
        scope.setExtra('timestamp', timestamp);
        scope.setExtra('resource', resource.slug);
        Sentry.captureException(error);
      });
      throw error;
    }
  }

  async indexBlocks(resource: Resource, slots: number[]): Promise<boolean> {
    for (const slot of slots) {
      try {
        console.log('Attempting to index slot', slot);
        const block = await this.connection
          .getBlock(slot, {
            maxSupportedTransactionVersion: 0,
            rewards: false,
          })
          .catch((error) => {
            if (error.code === -32004) {
              console.log(`Slot ${slot} has no block available, skipping`);
              return null;
            }
            throw error;
          });

        if (block) {
          console.log(`Processing block for slot ${slot}`);
          await this.storeBlockPrice(
            { ...block, slot } as SolanaBlock,
            resource
          );
        }
      } catch (error) {
        Sentry.withScope((scope: Scope) => {
          scope.setExtra('slot', slot);
          scope.setExtra('resource', resource.slug);
          Sentry.captureException(error);
        });
        console.error(`Error processing slot ${slot}:`, error);
      }
    }
    return true;
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log('Already watching blocks for this resource');
      return;
    }

    const startWatching = async () => {
      console.log(
        `Watching priority fees per compute unit for resource ${resource.slug}`
      );

      this.isWatching = true;

      // Initialize with current slot
      const currentSlot = await this.connection.getSlot('finalized');
      let lastProcessedSlot = currentSlot;
      console.log(`Starting to watch from slot ${currentSlot}`);

      // Subscribe to new slots but only process when we can get a block
      const subscription = this.connection.onSlotChange(async (slotInfo) => {
        try {
          // Wait for a few slots to ensure finalization
          const targetSlot = slotInfo.slot - 8; // Process blocks 8 slots behind

          // Skip if we've already processed this slot or if it's too recent
          if (targetSlot <= lastProcessedSlot || targetSlot <= 0) {
            return;
          }

          // Process all slots between last processed and current target
          for (let slot = lastProcessedSlot + 1; slot <= targetSlot; slot++) {
            // Skip if already processed or currently being processed
            if (
              this.processedSlots.has(slot) ||
              this.processingSlots.has(slot)
            ) {
              continue;
            }

            // Mark slot as being processed
            this.processingSlots.add(slot);

            try {
              const block = await this.connection.getBlock(slot, {
                maxSupportedTransactionVersion: 0,
                commitment: 'finalized',
                transactionDetails: 'full',
                rewards: false,
              });

              if (block) {
                await this.storeBlockPrice(
                  { ...block, slot } as SolanaBlock,
                  resource
                );
              } else {
                // Remove from processing if no block found
                this.processingSlots.delete(slot);
              }
            } catch (error: unknown) {
              // Remove from processing on error
              this.processingSlots.delete(slot);

              if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === -32004
              ) {
                // Skip slots with no blocks
                continue;
              }
              throw error;
            }
          }

          lastProcessedSlot = targetSlot;
          this.reconnectAttempts = 0;
        } catch (error: unknown) {
          console.error('Error processing block:', error);

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
              `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
            );
            setTimeout(startWatching, this.reconnectDelay);
          } else {
            console.error('Max reconnection attempts reached. Stopping watch.');
            Sentry.captureMessage(
              'Max reconnection attempts reached for block watcher'
            );
          }
        }
      });

      return () => {
        this.connection.removeSlotChangeListener(subscription);
        this.isWatching = false;
      };
    };

    await startWatching();
  }
}

export default SvmIndexer;
