import "tsconfig-paths/register";
import { Event } from "../entity/Event";
import { Market } from "../entity/Market";
import { Epoch } from "../entity/Epoch";
import { Abi, decodeEventLog, Log, PublicClient } from "viem";
import dataSource, { initializeDataSource } from "../db";
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
  const marketRepository = dataSource.getRepository(Market);
  const epochRepository = dataSource.getRepository(Epoch);
  const chainId = await publicClient.getChainId();

  // Ensure the market exists
  let market = await marketRepository.findOne({ where: { chainId, address: Foil.address } });
  if (!market) {
    market = new Market();
    market.chainId = chainId;
    market.address = Foil.address;
    await marketRepository.save(market);
  }

  // Process log data
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);
      const blockNumber = Number(log.blockNumber) || 0;
      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      // Extract epochId from logData (adjust this based on your event structure)
      const epochId = logData.args?.epochId || 0;

      await handleEventUpsert(
        eventRepository,
        marketRepository,
        epochRepository,
        chainId,
        Foil.address,
        epochId,
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
  const marketRepository = dataSource.getRepository(Market);
  const epochRepository = dataSource.getRepository(Epoch);
  const chainId = await publicClient.getChainId();

  // Ensure the market exists
  let market = await marketRepository.findOne({ where: { chainId, address: contractAddress } });
  if (!market) {
    market = new Market();
    market.chainId = chainId;
    market.address = contractAddress;
    await marketRepository.save(market);
  }

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

        const blockNumber = Number(log.blockNumber) || 0;
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);

        // Extract epochId from logData (adjust this based on your event structure)
        const epochId = logData.args?.epochId || 0;

        await handleEventUpsert(
          eventRepository,
          marketRepository,
          epochRepository,
          chainId,
          contractAddress,
          epochId,
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
  marketRepository: Repository<Market>,
  epochRepository: Repository<Epoch>,
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: number,
  logIndex: number,
  logData: any
) => {
  console.log("Upserting event:", {
    chainId,
    address,
    epochId,
    blockNumber,
    logIndex,
    logData,
  });

  // Find or create the market
  let market = await marketRepository.findOne({ where: { chainId, address } });
  if (!market) {
    market = new Market();
    market.chainId = chainId;
    market.address = address;
    await marketRepository.save(market);
  }

  // Find or create the epoch
  let epoch = await epochRepository.findOne({ where: { market, epochId } });
  if (!epoch) {
    epoch = new Epoch();
    epoch.market = market;
    epoch.epochId = epochId;
    await epochRepository.save(epoch);
  }

  // Create a new Event entity
  const newEvent = new Event();
  newEvent.epoch = epoch;
  newEvent.blockNumber = blockNumber.toString();
  newEvent.logIndex = logIndex;
  newEvent.logData = logData;

  // Upsert the event
  await eventRepository.upsert(newEvent, ["epoch", "blockNumber", "logIndex"]);
};