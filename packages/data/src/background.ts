import { createConnection } from 'typeorm';
import { Event } from './entity/Event';
import Foil from '../deployments/Foil.json';
import { createPublicClient, http, Log } from 'viem'
import { hardhat } from 'viem/chains'
 
const bigintReplacer = (key: string, value: any) => {
    if (typeof value === 'bigint') {
      return value.toString(); // Convert BigInt to string
    }
    return value;
  };
  
// Initialize RPC connection
hardhat.id = 13370 as any;
export const publicClient = createPublicClient({
  chain: hardhat,
  transport: http() // switch to websockets? should automatically switch poll default on watchContractEvent 
})

const startBackgroundProcess = async () => {
    // Initialize database connection
    const connection = await createConnection({
        type: "sqlite",
        database: "./data/database.sqlite",
        synchronize: true,
        logging: false,
        entities: [Event],
    });
    const eventRepository = connection.getRepository(Event);

    // Process log data
    const processLogs = async (logs: Log[]) => {
        for(const log of logs){
            const serializedLog = JSON.stringify(log, bigintReplacer);
            const event = eventRepository.create({
              logData: JSON.parse(serializedLog), // Parse back to JSON object
              contractId: `${hardhat.id}:${Foil.address}`
            });

            await eventRepository.save(event);
            console.log('Event created:', event);
        }
    }

    // Start watching for new events
    console.log(`Watching contract events for ${Foil.address}`)
    const unwatch = publicClient.watchContractEvent({
        address: Foil.address as `0x${string}`,
        abi: Foil.abi,
        onLogs: logs => processLogs(logs),
        onError: logs => console.error(logs)
    })
};

startBackgroundProcess().catch(error => console.log(error));
