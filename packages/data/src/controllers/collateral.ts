import "tsconfig-paths/register";
import {
  initializeDataSource,
  marketRepository,
  collateralTransferRepository,
} from "../db";
import { Market } from "../models/Market";
import { CollateralTransfer } from "../models/CollateralTransfer";
import collateralAbi from "./abi/collateralAbi.json";
import { decodeEventLog, Log, parseAbiItem } from "viem";
import { getProviderForChain, bigintReplacer } from "../helpers";

// Called when the process starts after initialization. Watches events for a given market and calls upsertCollateralTransferEvent for each one.
export const indexCollateralEvents = async (market: Market) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const chainId = await client.getChainId();
  const collateralAddress =
    market.collateralAsset || "0xB82381A3fBD3FaFA77B3a7bE693342618240067b";

  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const blockNumber = log.blockNumber || 0n;
      const block = await client.getBlock({
        blockNumber,
      });

      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      const epochId = logData.args?.epochId || 0;

      await upsertCollateralTransferEvent(
        chainId,
        market.address,
        collateralAddress,
        epochId,
        blockNumber,
        block.timestamp,
        logIndex,
        logData
      );
    }
  };

  console.log(
    `Watching contract events for ${market.chainId}:${market.address} collateral: ${collateralAddress} `
  );
  client.watchContractEvent({
    address: collateralAddress as `0x${string}`,
    abi: collateralAbi,
    eventName: "Transfer",
    args: [market.address as `0x${string}`],
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

// Iterates over all blocks from the market's deploy block to the current block and calls upsertCollateralTransferEvent for each one.
export const reindexCollateralEvents = async (market: Market) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const collateralAddress =
    market.collateralAsset || "0xB82381A3fBD3FaFA77B3a7bE693342618240067b";

  const startBlock = market.deployTxnBlockNumber || 0;
  const endBlock = await client.getBlockNumber();
  const chainId = await client.getChainId();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.log("Indexing market events from block ", blockNumber);
    try {
      const logs = await client.getLogs({
        address: collateralAddress as `0x${string}`,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)"
        ),
        args: {
          from: market.address as `0x${string}`,
          to: market.address as `0x${string}`,
        },
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        const decodedLog = decodeEventLog({
          abi: collateralAbi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);
        const blockNumber = log.blockNumber;
        const block = await client.getBlock({
          blockNumber: log.blockNumber,
        });
        const logIndex = log.logIndex || 0;
        const logData = {
          ...JSON.parse(serializedLog),
          transactionHash: log.transactionHash || "",
          blockHash: log.blockHash || "",
          blockNumber: log.blockNumber?.toString() || "",
          logIndex: log.logIndex || 0,
          transactionIndex: log.transactionIndex || 0,
          removed: log.removed || false,
          topics: log.topics || [],
          data: log.data || "",
        };

        // Extract epochId from logData (adjust this based on your event structure)
        const epochId = logData.args?.epochId || 0;

        await upsertCollateralTransferEvent(
          chainId,
          market.address,
          collateralAddress,
          epochId,
          blockNumber,
          block.timestamp,
          logIndex,
          logData
        );
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};

// Upserts an event into the database using the proper helper function.
const upsertCollateralTransferEvent = async (
  chainId: number,
  address: string,
  collateralAddress: string,
  epochId: number,
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: any
) => {
  console.log("handling event upsert:", {
    chainId,
    address,
    collateralAddress,
    epochId,
    blockNumber,
    timeStamp,
    logIndex,
    logData,
  });

  // // Find market and/or epoch associated with the event
  let market = await marketRepository.findOne({
    where: { chainId, address },
  });

  // marketInitialized should handle creating the market, throw if not found
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}. Cannot upsert event into db.`
    );
  }

  // Only handle transfers from/to the market address
  if (
    logData.args.from !== market.address &&
    logData.args.to !== market.address
  ) {
    return;
  }

  // If transfer to market, it's a deposit, otherwise a withdrawal
  // Consider deposits as positive, withdrawals as negative
  const collateral =
    logData.args.value * (logData.args.to === market.address ? 1 : -1);
  const owner =
    logData.args.to === market.address ? logData.args.from : logData.args.to;

  console.log("inserting new transfer collateral event..");
  // Create a new Event entity
  const collateralTransfer = new CollateralTransfer();
  collateralTransfer.market = market;
  collateralTransfer.owner = owner;
  collateralTransfer.collateral = collateral.toString();
  collateralTransfer.timestamp = Number(timeStamp);

  // insert the event
  await collateralTransferRepository.save(collateralTransfer);
};
