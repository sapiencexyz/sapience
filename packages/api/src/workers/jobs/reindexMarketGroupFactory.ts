import { initializeDataSource } from '../../db';
import * as Sentry from '@sentry/node';
import {
  getBlockByTimestamp,
  getContractCreationBlock,
  getProviderForChain,
} from '../../utils/utils';
import { Abi, decodeEventLog, Log } from 'viem';
import marketGroupFactoryData from '@foil/protocol/deployments/FoilFactory.json';
import { handleMarketGroupInitialized } from './indexMarkets';

const marketGroupFactoryAbi = marketGroupFactoryData.abi;
const CHUNK_SIZE = 10000; // Process 10,000 blocks at a time

export async function reindexMarketGroupFactory(
  chainId: number,
  factoryAddress: string
) {
  try {
    console.log(
      `Reindexing market groups from factory address ${factoryAddress} on chain ${chainId}`
    );

    // Check if the factory address is valid
    if (
      !factoryAddress ||
      factoryAddress === '0x0000000000000000000000000000000000000000'
    ) {
      console.error(`Invalid factory address ${factoryAddress}`);
      return;
    }

    await initializeDataSource();

    // Function to process logs regardless of how they were fetched
    const processLogs = async (logs: Log[]) => {
      for (const log of logs) {
        try {
          const decodedLog = decodeEventLog({
            abi: marketGroupFactoryAbi as Abi,
            data: log.data,
            topics: log.topics,
          });
          const eventArgs = decodedLog.args as unknown as {
            sender: `0x${string}`;
            marketGroup: `0x${string}`;
            nonce: bigint;
          };
          handleMarketGroupInitialized(
            eventArgs,
            chainId,
            factoryAddress,
            client
          );
        } catch (error) {
          console.error(
            `Error decoding MarketGroupInitialized event from factory ${factoryAddress}:`,
            error,
            log
          );
        }
      }
    };

    const client = getProviderForChain(chainId);
    const { startBlock, endBlock } = await getStartAndEndBlock(
      chainId,
      factoryAddress
    );

    console.log(
      `Reindexing market groups from factory ${factoryAddress} on chain ${chainId} from block ${startBlock} to ${endBlock.number}`
    );

    // Process blocks in chunks to avoid RPC limitations
    let currentBlock = startBlock;
    let totalLogsProcessed = 0;

    while (currentBlock <= Number(endBlock.number ?? BigInt(currentBlock))) {
      const chunkEndBlock = Math.min(
        currentBlock + CHUNK_SIZE - 1,
        Number(endBlock.number ?? BigInt(currentBlock))
      );

      try {
        console.log(
          `Fetching logs for blocks ${currentBlock} to ${chunkEndBlock}`
        );
        const logs = await client.getLogs({
          address: factoryAddress as `0x${string}`,
          fromBlock: BigInt(currentBlock),
          toBlock: BigInt(chunkEndBlock),
        });

        if (logs.length > 0) {
          console.log(
            `Found ${logs.length} logs in blocks ${currentBlock}-${chunkEndBlock}`
          );
          await processLogs(logs);
          totalLogsProcessed += logs.length;
        }

        // Move to the next chunk
        currentBlock = chunkEndBlock + 1;
      } catch (error) {
        console.error(
          `Error fetching logs for block range ${currentBlock}-${chunkEndBlock}:`,
          error
        );

        // If a chunk fails, fall back to processing that chunk block by block
        console.log(
          `Falling back to block-by-block indexing for range ${currentBlock}-${chunkEndBlock}`
        );
        for (
          let blockNumber = currentBlock;
          blockNumber <= chunkEndBlock;
          blockNumber++
        ) {
          try {
            const logs = await client.getLogs({
              address: factoryAddress as `0x${string}`,
              fromBlock: BigInt(blockNumber),
              toBlock: BigInt(blockNumber),
            });

            if (logs.length > 0) {
              console.log(
                `Processing ${logs.length} logs from block ${blockNumber}`
              );
              await processLogs(logs);
              totalLogsProcessed += logs.length;
            }
          } catch (error) {
            console.error(`Error processing block ${blockNumber}:`, error);
          }
        }

        // Move to the next chunk
        currentBlock = chunkEndBlock + 1;
      }
    }

    console.log(
      `Completed indexing for market groups from factory ${factoryAddress}. Processed ${totalLogsProcessed} logs.`
    );
  } catch (error) {
    console.error('Error in reindexMarketGroupFactory:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('address', factoryAddress);
      Sentry.captureException(error);
    });
    throw error;
  }
}

async function getStartAndEndBlock(chainId: number, factoryAddress: string) {
  const client = getProviderForChain(chainId);

  // Get the contract deployment time and us it as initial lookback start time
  let deploymentBlock;
  try {
    deploymentBlock = await getContractCreationBlock(client, factoryAddress);
  } catch (err) {
    const error = err as Error;
    console.error(`Failed to get contract creation block: ${error.message}`);
    throw new Error(`Failed to get contract creation block: ${error.message}`);
  }

  const startBlock = Math.max(
    Number(0), // Find if there's any clue to where to restart (or store it somewhere)
    Number(deploymentBlock.block.number)
  );

  // Get the end block using the sooner of epoch end time and current time
  const currentTime = Math.floor(Date.now() / 1000);
  const endTime = currentTime;

  let endBlock;
  try {
    endBlock = await getBlockByTimestamp(client, endTime);
  } catch (err) {
    const error = err as Error;
    console.error(
      `Failed to get end block for timestamp ${endTime}: ${error.message}`
    );
    console.log(`Using current block as fallback`);
    try {
      const latestBlockNumber = await client.getBlockNumber();
      endBlock = await client.getBlock({ blockNumber: latestBlockNumber });
      console.log(
        `Successfully retrieved current block ${latestBlockNumber} as fallback`
      );
    } catch (fbErr) {
      const fallbackError = fbErr as Error;
      console.error(
        `Failed to get latest block as fallback: ${fallbackError.message}`
      );
      throw new Error(
        `Could not determine end block for reindexing: ${error.message}`
      );
    }
  }
  return { startBlock, endBlock };
}
