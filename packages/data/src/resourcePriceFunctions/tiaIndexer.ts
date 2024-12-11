import { IResourcePriceIndexer } from "./ResourcePriceIndexerInterface";
import { resourcePriceRepository } from "../db";
import { ResourcePrice } from "../models/ResourcePrice";
import { type Market } from "../models/Market";
import WebSocket from 'ws';
import { CELENIUM_API_KEY } from '../helpers';

const headers: HeadersInit = {};
if (CELENIUM_API_KEY) {
  headers.apiKey = CELENIUM_API_KEY;
}

class TiaIndexer implements IResourcePriceIndexer {
  public celeniumEndpoint: string;
  private ws: WebSocket | null = null;

  constructor(celeniumEndpoint: string) {
    this.celeniumEndpoint = celeniumEndpoint;
  }

  private async storeBlockPrice(block: any, market: Market) {
    const used = block?.stats?.blobs_size;
    const value = block?.stats?.fee / used;
    if (!value || !block.height) {
      console.error(
        `No resource price for block ${block?.height} on market ${market.chainId}:${market.address}`
      );
      return;
    }

    const price = new ResourcePrice();
    price.market = market;
    price.timestamp = new Date(block.time).getTime();
    price.value = value.toString();
    price.used = used.toString();
    price.blockNumber = Number(block.height);
    await resourcePriceRepository.upsert(price, ["market", "timestamp"]);
  }

  private async getBlockFromCelenium(blockNumber: number) {

    const response = await fetch(
      `https://${this.celeniumEndpoint}/v1/block/${blockNumber}?stats=true`,
      { headers }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch block ${blockNumber}`);
    }
    return response.json();
  }

  private async getBlockByTimestamp(timestamp: number): Promise<number> {
    // Get the latest block first
    const latestBlock = await this.getBlockFromCelenium(await this.getLatestBlockNumber());
    
    let low = 1;
    let high = latestBlock.height;
    let closestBlock: any = null;

    // Binary search for the block with the closest timestamp
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await this.getBlockFromCelenium(mid);

      if (new Date(block.time).getTime() < timestamp) {
        low = mid + 1;
      } else {
        high = mid - 1;
        closestBlock = block;
      }
    }

    if (!closestBlock) {
      throw new Error("No block found at timestamp");
    }

    return closestBlock.height;
  }

  private async getLatestBlockNumber(): Promise<number> {
    const response = await fetch(
      `https://${this.celeniumEndpoint}/v1/block/count`,
      { headers }
    );
    if (!response.ok) {
      throw new Error('Failed to fetch latest block number');
    }
    const data = await response.json();
    return data.count;
  }

  async indexBlockPriceFromTimestamp(
    market: Market,
    timestamp: number
  ): Promise<boolean> {
    const initialBlockNumber = await this.getBlockByTimestamp(timestamp);
    if (!initialBlockNumber) {
      throw new Error("No block found at timestamp");
    }
    const currentBlock = await this.getBlockFromCelenium(initialBlockNumber);

    for (
      let blockNumber = initialBlockNumber;
      blockNumber <= currentBlock.height;
      blockNumber++
    ) {
      try {
        console.log("Indexing gas from block ", blockNumber);

        const block = await this.getBlockFromCelenium(blockNumber);
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async indexBlocks(
    market: Market,
    blocks: number[]
  ): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log("Indexing gas from block", blockNumber);
        
        const block = await this.getBlockFromCelenium(blockNumber);
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async watchBlocksForMarket(market: Market) {
    console.log(
      `Watching blocks on Celenium for market ${market.chainId}:${market.address}`
    );
    
    this.setupWebSocket();
    
    this.ws?.on('message', async (data: any) => {
      const message = JSON.parse(data.toString());
      if (message.channel === 'blocks') {
        await this.storeBlockPrice(message.body, market);
      }
    });

    this.ws?.on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });
  }

  private setupWebSocket() {
    const wsUrl = new URL(`wss://${this.celeniumEndpoint}/v1/ws`);
    
    const options = {
        headers: {
            'apiKey': process.env.CELENIUM_API_KEY || ''
        }
    };
    
    console.log("WebSocket URL:", wsUrl.toString());
    
    this.ws = new WebSocket(wsUrl.toString(), options);
    
    this.ws.on('open', () => {
      console.log("WebSocket connection opened");
      this.ws?.send(JSON.stringify({
        method: "subscribe",
        body: {
          channel: "blocks"
        }
      }));
    });

    this.ws.on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });

    this.ws.on('close', (code: number, reason: string) => {
      console.log(`WebSocket closed with code: ${code}, reason: ${reason}`);
    });
  }
}

export default TiaIndexer;
