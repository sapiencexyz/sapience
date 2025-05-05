import { MarketGroup } from '../../models/MarketGroup';
import { marketGroupRepository } from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { Log, decodeEventLog, PublicClient, Abi } from 'viem';
import { indexMarketEvents } from '../../controllers/market';
import marketGroupFactoryData from '@foil/protocol/deployments/FoilFactory.json';

const marketGroupFactoryAbi = marketGroupFactoryData.abi;

/**
 * Sets up event watching for a single market group using the logic from market.ts.
 */
async function startIndexingForMarketGroup(
  marketGroup: MarketGroup,
  client: PublicClient
): Promise<() => void> {
  console.log(
    `Starting event indexing for Market Group: ${marketGroup.chainId}:${marketGroup.address}`
  );
  try {
    const unwatch = await indexMarketEvents(marketGroup, client);
    if (typeof unwatch === 'function') {
      return unwatch;
    } else {
      console.warn(
        `indexMarketEvents did not return an unwatch function for market group ${marketGroup.address}`
      );
      return () => {};
    }
  } catch (error) {
    console.error(
      `Error starting indexing for market group ${marketGroup.address}:`,
      error
    );
    return () => {};
  }
}

export async function handleMarketGroupInitialized(
  eventArgs: {
    sender: `0x${string}`;
    marketGroup: `0x${string}`;
    nonce: bigint;
  },
  chainId: number,
  factoryAddress: string,
  client: PublicClient
) {
  console.log('MarketGroupInitialized event caught:', eventArgs);

  const nonce = eventArgs.nonce.toString();
  const sender = eventArgs.sender.toLowerCase();
  const newMarketGroupAddress = eventArgs.marketGroup.toLowerCase();

  // Check if sender is in the approved list
  const approvedAddresses = ['8453:0x66aB20e98fcACfadB298C0741dFddA92568B5826'];
  const senderWithChain = `${chainId}:${sender}`;
  const normalizedApprovedAddresses = approvedAddresses.map((addr) =>
    addr.toLowerCase()
  );

  if (
    approvedAddresses.length > 0 &&
    !normalizedApprovedAddresses.includes(senderWithChain)
  ) {
    console.log(
      `Skipping MarketGroupInitialized event: sender ${senderWithChain} is not in the approved list.`
    );
    return;
  }

  try {
    // Find the existing market group record based on initialization nonce, factory address, and chain ID.
    const existingMarketGroup = await marketGroupRepository.findOneBy({
      initializationNonce: nonce,
      factoryAddress: factoryAddress.toLowerCase(),
      chainId: chainId,
    });

    if (existingMarketGroup) {
      // Update the address and owner of the existing record
      existingMarketGroup.address = newMarketGroupAddress;
      existingMarketGroup.owner = sender; // Also update owner if it can change or wasn't set initially

      await marketGroupRepository.save(existingMarketGroup);

      console.log(
        `Updated market group address to ${newMarketGroupAddress} for nonce ${nonce} on chain ${chainId}.`
      );

      // Fetch the updated record including necessary relations for indexing.
      // Note: We refetch here to ensure relations are loaded correctly if they weren't loaded initially
      // or if the save operation returns an object without relations.
      const marketGroupRecord = await marketGroupRepository.findOne({
        where: { id: existingMarketGroup.id }, // Use the ID for certainty
        relations: ['marketParams'], // Load relations needed for indexing
      });

      if (marketGroupRecord) {
        console.log(
          `Market group record (ID: ${marketGroupRecord.id}) updated. Starting indexing.`
        );
        await startIndexingForMarketGroup(marketGroupRecord, client);
      } else {
        // This case should be less likely now, but good to keep the check.
        console.error(
          `Could not re-find market group record (ID: ${existingMarketGroup.id}) after update.`
        );
      }
    } else {
      // This indicates a problem: the MarketGroupInitialized event was received,
      // but no corresponding initial record was found.
      console.error(
        `Error processing MarketGroupInitialized event: No initial market group record found for nonce ${nonce}, factory ${factoryAddress}, chainId ${chainId}.`
      );
      // Depending on requirements, you might want to insert a new record here,
      // but it suggests an issue elsewhere if the initial record is expected.
      // For now, we just log the error.
    }
  } catch (error) {
    console.error(
      `Error processing MarketGroupInitialized event for nonce ${nonce} on chain ${chainId}:`,
      error
    );
  }
}

/**
 * Sets up a watcher for a specific factory address to monitor MarketGroupInitialized events.
 * Can be called when a new factory address is detected in the system.
 *
 */
export async function watchFactoryAddress(
  chainId: number,
  factoryAddress: string
): Promise<() => void> {
  console.log(
    `Setting up watcher for factory address ${factoryAddress} on chain ${chainId}`
  );

  const client = getProviderForChain(chainId);

  // Check if the factory address is valid
  if (
    !factoryAddress ||
    factoryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    console.error(`Invalid factory address ${factoryAddress}`);
    return () => {};
  }

  try {
    console.log(
      `Watching MarketGroupInitialized events on factory ${factoryAddress}`
    );

    const unwatch = client.watchContractEvent({
      address: factoryAddress as `0x${string}`,
      abi: marketGroupFactoryAbi as Abi,
      eventName: 'MarketGroupInitialized',
      onLogs: (logs: Log[]) => {
        logs.forEach((log) => {
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
        });
      },
      onError: (error) => {
        console.error(
          `Error watching MarketGroupInitialized events on factory ${factoryAddress}:`,
          error
        );
      },
    });

    console.log(
      `Watcher setup complete for factory ${factoryAddress} on chain ${chainId}`
    );

    return unwatch;
  } catch (error) {
    console.error(
      `Error setting up watcher for factory ${factoryAddress} on chain ${chainId}:`,
      error
    );
    throw error;
  }
}

export async function startIndexingAndWatchingMarketGroups(
  chainId: number
): Promise<() => void> {
  const client = getProviderForChain(chainId);
  const unwatchFunctions: (() => void)[] = [];

  const marketGroups = await marketGroupRepository.find({
    where: { chainId },
    select: [
      'id',
      'address',
      'factoryAddress',
      'initializationNonce',
      'chainId',
    ],
    relations: ['marketParams'],
  });

  console.log(
    `Found ${marketGroups.length} existing market groups for chainId ${chainId}. Starting indexing...`
  );
  for (const marketGroup of marketGroups) {
    if (
      marketGroup.address &&
      marketGroup.address !== '0x0000000000000000000000000000000000000000'
    ) {
      try {
        const unwatch = await createResilientMarketGroupWatcher(
          marketGroup,
          client
        );
        unwatchFunctions.push(unwatch);
      } catch (error) {
        console.error(
          `Failed to start resilient indexing for market group ${marketGroup.address}:`,
          error
        );
      }
    }
  }

  const factoryAddresses = [
    ...new Set(
      marketGroups
        .map((mg) => mg.factoryAddress)
        .filter((addr): addr is string => !!addr)
    ),
  ];
  console.log(
    `Found ${factoryAddresses.length} unique factory addresses for chainId ${chainId}. Setting up watchers...`
  );

  // Use the new watchFactoryAddress function for each factory
  for (const factoryAddress of factoryAddresses) {
    try {
      const unwatch = await createResilientFactoryWatcher(
        chainId,
        factoryAddress
      );
      unwatchFunctions.push(unwatch);
    } catch (error) {
      console.error(
        `Failed to set up resilient watcher for factory ${factoryAddress} on chain ${chainId}:`,
        error
      );
    }
  }

  console.log(
    `Initialization and watching setup complete for chainId ${chainId}.`
  );

  // Return a function that will unwatch all event subscriptions
  return () => {
    console.log(`Stopping all watchers for chainId ${chainId}...`);
    unwatchFunctions.forEach((unwatch) => {
      try {
        unwatch();
      } catch (error) {
        console.error('Error while unwatching:', error);
      }
    });
    console.log(`All watchers stopped for chainId ${chainId}.`);
  };
}

/**
 * Creates a resilient watcher that will automatically reconnect if the websocket fails
 * @param setupWatcher Function that sets up the watcher and returns an unwatch function
 * @param name Descriptive name for logging
 * @param maxRetries Maximum number of reconnection attempts
 * @param initialRetryDelay Initial delay before retry (will be exponentially increased)
 * @returns A function that can be used to stop the watcher completely
 */
async function createResilientWatcher(
  setupWatcher: () => Promise<() => void>,
  name: string,
  maxRetries = 5,
  initialRetryDelay = 5000
): Promise<() => void> {
  let isActive = true;
  let currentUnwatch: (() => void) | null = null;
  let currentRetry = 0;
  let retryDelay = initialRetryDelay;

  // Function to start or restart the watcher
  const startWatcher = async () => {
    if (!isActive) return;

    try {
      console.log(`Setting up watcher for ${name}...`);
      const unwatch = await setupWatcher();
      currentUnwatch = unwatch;
      currentRetry = 0;
      retryDelay = initialRetryDelay;
      console.log(`Watcher for ${name} successfully established.`);
    } catch (error) {
      console.error(`Error setting up watcher for ${name}:`, error);
      scheduleRetry();
    }
  };

  // Function to schedule a retry with exponential backoff
  const scheduleRetry = () => {
    if (!isActive) return;

    currentRetry += 1;
    if (currentRetry > maxRetries) {
      console.error(
        `Exceeded maximum retries (${maxRetries}) for ${name}. Giving up.`
      );
      return;
    }

    console.log(
      `Scheduling retry #${currentRetry} for ${name} in ${retryDelay}ms...`
    );
    setTimeout(async () => {
      await startWatcher();
    }, retryDelay);

    // Exponential backoff
    retryDelay = Math.min(retryDelay * 2, 60000); // Cap at 1 minute
  };

  // Initial start
  await startWatcher();

  // Return a function to stop the resilient watcher
  return () => {
    isActive = false;
    if (currentUnwatch) {
      try {
        currentUnwatch();
        console.log(`Unwatched ${name} successfully.`);
      } catch (error) {
        console.error(`Error unwatching ${name}:`, error);
      }
    }
  };
}

/**
 * Creates a resilient factory watcher that automatically reconnects
 * @param chainId Chain ID to watch
 * @param factoryAddress Factory address to watch
 * @returns A function to stop watching
 */
async function createResilientFactoryWatcher(
  chainId: number,
  factoryAddress: string
): Promise<() => void> {
  return createResilientWatcher(
    async () => watchFactoryAddress(chainId, factoryAddress),
    `factory ${factoryAddress} on chain ${chainId}`
  );
}

/**
 * Creates a resilient market group watcher that automatically reconnects
 * @param marketGroup Market group to watch
 * @param client Public client to use
 * @returns A function to stop watching
 */
async function createResilientMarketGroupWatcher(
  marketGroup: MarketGroup,
  client: PublicClient
): Promise<() => void> {
  return createResilientWatcher(
    async () => startIndexingForMarketGroup(marketGroup, client),
    `market group ${marketGroup.address} on chain ${marketGroup.chainId}`
  );
}
