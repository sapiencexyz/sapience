import { resourcePriceRepository } from '../db';
import { Connection, Logs } from '@solana/web3.js';
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
      prioritizationFee?: number;
    };
  }>;
}

class SvmIndexer implements IResourcePriceIndexer {
  public client: undefined; // To satisfy interface
  private connection: Connection;
  private isWatching: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  private async storeBlockPrice(block: SolanaBlock, resource: Resource) {
    if (!block || !block.transactions) {
      console.warn(`Invalid block data for resource ${resource.slug}. Skipping block.`);
      return;
    }

    try {
      // Sum up total compute units and priority fees for the block
      let totalComputeUnits = 0n;
      let totalPriorityFees = 0n;

      for (const tx of block.transactions) {
        if (tx.meta) {
          totalComputeUnits += BigInt(tx.meta.computeUnitsConsumed || 0);
          totalPriorityFees += BigInt(tx.meta.prioritizationFee || 0);
        }
      }

      // Skip if no compute units or fees found
      if (totalComputeUnits === 0n) {
        return;
      }

      // Calculate average priority fee per compute unit
      const avgPriorityFeePerCU = totalComputeUnits > 0n 
        ? totalPriorityFees / totalComputeUnits 
        : 0n;

      const price = {
        resource: { id: resource.id },
        timestamp: block.blockTime ? Number(block.blockTime) : Math.floor(Date.now() / 1000),
        value: avgPriorityFeePerCU.toString(), // Priority fee per compute unit
        used: totalComputeUnits.toString(), // Total compute units
        feePaid: totalPriorityFees.toString(), // Total priority fees
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
          await this.storeBlockPrice({ ...block, slot } as SolanaBlock, resource);
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
        const block = await this.connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
          rewards: false,
        });
        
        if (block) {
          await this.storeBlockPrice({ ...block, slot } as SolanaBlock, resource);
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

    const startWatching = () => {
      console.log(
        `Watching priority fees per compute unit for resource ${resource.slug}`
      );

      this.isWatching = true;

      // Subscribe to new blocks using onSlotChange
      const subscription = this.connection.onSlotChange(async (slotInfo) => {
        try {
          const block = await this.connection.getBlock(slotInfo.slot, {
            maxSupportedTransactionVersion: 0,
            rewards: false,
          });
          
          if (block) {
            await this.storeBlockPrice({ ...block, slot: slotInfo.slot } as SolanaBlock, resource);
          }
          this.reconnectAttempts = 0;
        } catch (error) {
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

    startWatching();
  }
}

export default SvmIndexer;
