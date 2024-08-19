import 'tsconfig-paths/register';
import { createConnection } from 'typeorm';
import { Event } from '../entity/Event';
import { Abi, decodeEventLog, Log, PublicClient } from 'viem';
import connectionOptions from '../db';

const bigintReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const indexMarketEvents = async (publicClient: PublicClient, Foil: { address: string, abi: Abi }) => {
  // Initialize database connection
  const connection = await createConnection(connectionOptions);
  const eventRepository = connection.getRepository(Event);
  const chainId = await publicClient.getChainId();

  // Process log data
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);

      const contractId = `${chainId}:${Foil.address}`;
      const blockNumber = Number(log.blockNumber) || 0;
      const logIndex = log.logIndex || 0;
      const logData = JSON.parse(serializedLog); // Parse back to JSON object

      console.log('Upserting event:', { contractId, blockNumber, logIndex, logData });

      await eventRepository.query(
        `INSERT INTO "event" ("contractId", "blockNumber", "logIndex", "logData")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("contractId", "blockNumber", "logIndex")
         DO UPDATE SET "logData" = EXCLUDED."logData"`,
        [contractId, blockNumber, logIndex, logData]
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
  const connection = await createConnection(connectionOptions);
  const eventRepository = connection.getRepository(Event);

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

        console.log('Upserting event:', { contractId, blockNumber, logIndex, logData });

        await eventRepository.query(
          `INSERT INTO "event" ("contractId", "blockNumber", "logIndex", "logData")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("contractId", "blockNumber", "logIndex")
           DO UPDATE SET "logData" = EXCLUDED."logData"`,
          [contractId, blockNumber, logIndex, logData]
        );
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }
};
