import "tsconfig-paths/register";
import dataSource, { initializeDataSource } from "src/db";
import { Event } from "../entity/Event";
import { Abi, decodeEventLog, Log, PublicClient } from "viem";
import { Repository } from "typeorm";

const bigintReplacer = (key: string, value: any) => {
  if (typeof value === "bigint") {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const indexMarketEvents = async (
  publicClient: PublicClient,
  Foil: { address: string; abi: Abi }
) => {
  await initializeDataSource();
  const eventRepository = dataSource.getRepository(Event);
  const chainId = await publicClient.getChainId();

  // Process log data
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const contractId = `${chainId}:${Foil.address}`;
      const blockNumber = Number(log.blockNumber) || 0;
      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      await handleEventUpsert(
        eventRepository,
        contractId,
        blockNumber,
        logIndex,
        logData
      );
    }
  };

  // Start watching for new events
  console.log(`Watching contract events for ${Foil.address}`);
  publicClient.watchContractEvent({
    address: Foil.address as `0x${string}`,
    abi: Foil.abi,
    onLogs: (logs) => processLogs(logs),
    onError: (error) => console.error(error),
  });
};

export const indexMarketEventsRange = async (
  publicClient: PublicClient,
  start: number,
  end: number,
  contractAddress: string,
  contractAbi: Abi
) => {
  await initializeDataSource();
  const eventRepository = dataSource.getRepository(Event);

  for (let blockNumber = start; blockNumber <= end; blockNumber++) {
    console.log(`Processing block ${blockNumber}`);
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress as `0x${string}`,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        const decodedLog = decodeEventLog({
          abi: contractAbi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);

        const contractId = `${await publicClient.getChainId()}:${contractAddress}`;
        const blockNumber = Number(log.blockNumber) || 0;
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);

        await handleEventUpsert(
          eventRepository,
          contractId,
          blockNumber,
          logIndex,
          logData
        );
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};

const handleEventUpsert = async (
  eventRepository: Repository<Event>,
  contractId: string,
  blockNumber: number,
  logIndex: number,
  logData: any
) => {
  console.log("Upserting event:", {
    contractId,
    blockNumber,
    logIndex,
    logData,
  });
  // Create a new Event entity
  const newEvent = new Event();
  newEvent.contractId = contractId;
  newEvent.blockNumber = blockNumber.toString();
  newEvent.logIndex = logIndex;
  newEvent.logData = logData;
  await eventRepository.upsert(newEvent, [
    "contractId",
    "blockNumber",
    "logIndex",
  ]);
};
