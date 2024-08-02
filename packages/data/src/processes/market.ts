import 'tsconfig-paths/register';
import { createConnection } from 'typeorm';
import { Event } from '../entity/Event';
import { Abi, Log, PublicClient } from 'viem';
import connectionOptions from '../db';

const bigintReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const indexMarketEvents = async (publicClient: PublicClient, Foil: {address: string, abi: Abi}) => {
  // Initialize database connection
  const connection = await createConnection(connectionOptions);
  const eventRepository = connection.getRepository(Event);
  const chainId = await publicClient.getChainId();

  // Process log data
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      const serializedLog = JSON.stringify(log, bigintReplacer);
      const event = eventRepository.create({
        logData: JSON.parse(serializedLog), // Parse back to JSON object
        contractId: `${chainId}:${Foil.address}`,
      });

      console.log('Creating event:', event);
      await eventRepository.save(event);
    }
  };

  // Start watching for new events
  console.log(`Watching contract events for ${Foil.address}`);
  publicClient.watchContractEvent({
    address: Foil.address as `0x${string}`,
    abi: Foil.abi,
    onLogs: (logs) => processLogs(logs),
    onError: (logs) => console.error(logs),
  });
};
