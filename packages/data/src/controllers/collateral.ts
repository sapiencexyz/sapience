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
      // Only handle transfers from/to the market address
      if (
        logData.args.from.toUpperCase() !== market.address.toUpperCase() &&
        logData.args.to.toUpperCase() !== market.address.toUpperCase()
      ) {
        return;
      }

      await upsertCollateralTransferEvent(
        chainId,
        market.address,
        collateralAddress,
        blockNumber,
        block.timestamp,
        logIndex,
        logData
      );
    }
  };

  console.log(
    `Watching collateral transfer events on collateral ${collateralAddress} for market ${market.chainId}:${market.address} `
  );
  client.watchContractEvent({
    address: collateralAddress as `0x${string}`,
    abi: collateralAbi,
    eventName: "Transfer",
    // args: [market.address as `0x${string}`], // TODO filter by market address in from or to
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

// Iterates over all blocks from the market's deploy block to the current block and calls upsertCollateralTransferEvent for each one.
export const reindexCollateralEvents = async (market: Market) => {
  console.log(
    "reindexing collateral transfer events for market",
    market.address
  );
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const collateralAddress =
    market.collateralAsset || "0xB82381A3fBD3FaFA77B3a7bE693342618240067b";

  const startBlock = market.deployTxnBlockNumber || 0;
  const endBlock = await client.getBlockNumber();
  const chainId = await client.getChainId();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.log("Indexing collateral transfer events from block ", blockNumber);
    try {      
      const fromLogs = await client.getLogs({
        address: collateralAddress as `0x${string}`,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)"
        ),
        args: {
          from: market.address as `0x${string}`,
          // to: market.address as `0x${string}`,
        },
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      const toLogs = await client.getLogs({
        address: collateralAddress as `0x${string}`,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)"
        ),
        args: {
          // from: market.address as `0x${string}`,
          to: market.address as `0x${string}`,
        },
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });
      const logs = [...fromLogs, ...toLogs];

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

        await upsertCollateralTransferEvent(
          chainId,
          market.address,
          collateralAddress,
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
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: any
) => {
  console.log("handling collateral transfer upsert:", {
    chainId,
    address,
    collateralAddress,
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
    logData.args.from.toUpperCase() !== market.address.toUpperCase() &&
    logData.args.to.toUpperCase() !== market.address.toUpperCase()
  ) {
    return;
  }

  // If transfer to market, it's a deposit, otherwise a withdrawal
  const senderIsOwner =
    logData.args.to.toUpperCase() === market.address.toUpperCase();
  // Consider deposits as positive, withdrawals as negative
  const collateral = logData.args.value * (senderIsOwner ? 1 : -1);
  const owner = senderIsOwner ? logData.args.from : logData.args.to;

  console.log("inserting new transfer collateral event..");
  // Create a new Event entity
  const collateralTransfer = new CollateralTransfer();
  collateralTransfer.market = market;
  collateralTransfer.owner = owner;
  collateralTransfer.collateral = collateral.toString();
  collateralTransfer.timestamp = Number(timeStamp);
  collateralTransfer.blockNumber = Number(blockNumber);
  collateralTransfer.logIndex = logIndex;

  // insert the event
  await collateralTransferRepository.save(collateralTransfer);
};
