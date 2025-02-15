import { resourcePriceRepository } from '../db';
import { Connection, BlockResponse, Context, TransactionResponse, ConfirmedTransactionMeta } from '@solana/web3.js';
import Sentry from '../sentry';
import { IResourcePriceIndexer } from '../interfaces';
import { Resource } from 'src/models/Resource';
import type { Scope } from '@sentry/node';

// Extended type for transaction meta with prioritization fee
type ExtendedTransactionMeta = ConfirmedTransactionMeta & {
  prioritizationFee?: number;
};

interface SolanaBlock {
  blockhash: string;
  parentSlot: number;
  blockTime: number | null;
  slot: number;
  transactions: Array<{
    meta: {
      fee: number;
      computeUnitsConsumed?: number;
      prioritizationFee?: number;
    };
  }>;
}

class SvmIndexer implements IResourcePriceIndexer {
  private connection: Connection;
  private isWatching: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds

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

    try {
      // Sum up total compute units and fees for the block
      let totalComputeUnits = 0n;
      let totalBaseFees = 0n;
      let totalPriorityFees = 0n;

      for (const tx of block.transactions) {
        if (tx.meta) {
          const computeUnits = BigInt(tx.meta.computeUnitsConsumed || 0);
          totalComputeUnits += computeUnits;
          totalBaseFees += BigInt(tx.meta.fee || 0);
          totalPriorityFees += BigInt(tx.meta.prioritizationFee || 0);
        }
      }

      // Skip if no transactions or compute units
      if (totalComputeUnits === 0n || block.transactions.length === 0) {
        console.log(`Block ${block.slot}: No compute units or transactions found`);
        return;
      }

      // Calculate total fees (base + priority)
      const totalFees = totalBaseFees + totalPriorityFees;

      // Calculate average fee per compute unit (in lamports)
      const avgFeePerCU = totalFees / totalComputeUnits;

      console.log(`Block ${block.slot} stats:`, {
        transactions: block.transactions.length,
        totalComputeUnits: totalComputeUnits.toString(),
        totalBaseFees: totalBaseFees.toString(),
        totalPriorityFees: totalPriorityFees.toString(),
        avgFeePerCU: avgFeePerCU.toString(),
      });

      const price = {
        resource: { id: resource.id },
        timestamp: block.blockTime
          ? Number(block.blockTime)
          : Math.floor(Date.now() / 1000),
        value: avgFeePerCU.toString(), // Average fee (base + priority) per compute unit
        used: totalComputeUnits.toString(), // Total compute units
        feePaid: totalFees.toString(), // Total fees paid (base + priority)
        blockNumber: block.slot || 0,
      };

      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
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
        const block = await this.connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
          rewards: false,
        }).catch((error) => {
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
            // Add a small delay to allow for block finalization
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
              const block = await this.connection.getBlock(slot, {
                maxSupportedTransactionVersion: 0,
                commitment: 'finalized'
              });

              if (block) {
                console.log(`Processing block at slot ${slot}`);
                await this.storeBlockPrice(
                  { 
                    ...block,
                    slot,
                    transactions: block.transactions.map(tx => ({
                      meta: {
                        fee: (tx.meta as ExtendedTransactionMeta)?.fee || 0,
                        computeUnitsConsumed: (tx.meta as ExtendedTransactionMeta)?.computeUnitsConsumed,
                        prioritizationFee: (tx.meta as ExtendedTransactionMeta)?.prioritizationFee
                      }
                    }))
                  } as SolanaBlock,
                  resource
                );
              }
            } catch (error: any) {
              if (error?.code === -32004) {
                // Skip slots with no blocks
                continue;
              }
              throw error;
            }
          }
          
          lastProcessedSlot = targetSlot;
          this.reconnectAttempts = 0;
        } catch (error: any) {
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
