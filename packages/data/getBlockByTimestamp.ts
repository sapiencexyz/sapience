// Example usage:
// pnpm ts-node-dev getBlockByTimestamp.ts https://ethereum-rpc.publicnode.com 1722270000

import { createPublicClient, http, Block, Chain } from 'viem';

// Function to create a custom chain configuration
function createCustomChain(rpcUrl: string): Chain {
    return {
        id: 0,
        name: 'Custom',
        rpcUrls: {
            default: { http: [rpcUrl] },
            public: { http: [rpcUrl] }
        },
        nativeCurrency: {
            decimals: 18,
            name: 'Ether',
            symbol: 'ETH'
        }
    };
}

// Function to create a public client using the provided RPC URL
function createClient(rpcUrl: string) {
    const customChain = createCustomChain(rpcUrl);
    return createPublicClient({
        chain: customChain,
        transport: http()
    });
}

async function getBlockByTimestamp(client: ReturnType<typeof createClient>, timestamp: number): Promise<Block> {
    // Get the latest block number
    const latestBlockNumber = await client.getBlockNumber();
    
    // Get the latest block using the block number
    const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

    // Initialize the binary search range
    let low = 0n;
    let high = latestBlock.number;
    let closestBlock = latestBlock;

    // Binary search for the block with the closest timestamp
    while (low <= high) {
        const mid = (low + high) / 2n;
        const block = await client.getBlock({ blockNumber: mid });

        if (block.timestamp < timestamp) {
            low = mid + 1n;
        } else {
            high = mid - 1n;
            closestBlock = block;
        }
    }

    return closestBlock;
}

// Get the RPC URL and timestamp from the command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.error('Please provide both an RPC URL and a timestamp as arguments.');
    process.exit(1);
}

const rpcUrl = args[0];
const timestamp = Number(args[1]);

if (isNaN(timestamp)) {
    console.error('Invalid timestamp provided. Please provide a valid number.');
    process.exit(1);
}

const client = createClient(rpcUrl);

getBlockByTimestamp(client, timestamp).then(block => {
    console.log(`Block number corresponding to timestamp ${timestamp} is ${block.number?.toString()}`);
}).catch(console.error);