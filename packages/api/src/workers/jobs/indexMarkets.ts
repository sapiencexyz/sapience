import { MarketGroup } from '../../models/MarketGroup';
import { marketGroupRepository } from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { Log, decodeEventLog, PublicClient, Abi } from 'viem';
import { indexMarketEvents } from '../../controllers/market';
import marketGroupFactoryData from '@foil/protocol/deployments/FoilFactory.json';
import Sentry from '../../instrument';

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
  const approvedAddresses = ['8453:0xe29E04ecC05e226488429995a3f9e9ff7a09dDe8'];
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
 * Includes retry logic on error.
 */
export async function watchFactoryAddress(
  chainId: number,
  factoryAddress: string
): Promise<() => void> {
  const client = getProviderForChain(chainId);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 5000;

  let reconnectAttempts = 0;
  let currentUnwatch: (() => void) | null = null;
  let isActive = true; // To allow permanent stop

  const descriptiveName = `factory ${factoryAddress} on chain ${chainId}`;

  if (
    !factoryAddress ||
    factoryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    console.error(
      `[MarketFactoryWatcher] Invalid factory address ${factoryAddress}`
    );
    return () => {};
  }

  const startFactoryWatcher = () => {
    if (!isActive) {
      console.log(
        `[MarketFactoryWatcher] Watcher for ${descriptiveName} is permanently stopped. Not restarting.`
      );
      return;
    }

    console.log(
      `[MarketFactoryWatcher] Setting up watcher for ${descriptiveName}`
    );

    try {
      currentUnwatch = client.watchContractEvent({
        address: factoryAddress as `0x${string}`,
        abi: marketGroupFactoryAbi as Abi,
        eventName: 'MarketGroupInitialized',
        onLogs: (logs: Log[]) => {
          console.log(
            `[MarketFactoryWatcher] Received ${logs.length} logs for ${descriptiveName}`
          );
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
              reconnectAttempts = 0; // Reset on successful log processing
            } catch (error) {
              console.error(
                `[MarketFactoryWatcher] Error decoding MarketGroupInitialized event from ${descriptiveName}:`,
                error,
                log
              );
              Sentry.withScope((scope) => {
                scope.setExtra('factoryAddress', factoryAddress);
                scope.setExtra('chainId', chainId);
                scope.setExtra('log', log);
                Sentry.captureException(error);
              });
            }
          });
        },
        onError: (error) => {
          console.error(
            `[MarketFactoryWatcher] Error watching ${descriptiveName}:`,
            error
          );
          Sentry.withScope((scope) => {
            scope.setExtra('factoryAddress', factoryAddress);
            scope.setExtra('chainId', chainId);
            Sentry.captureException(error);
          });

          if (currentUnwatch) {
            currentUnwatch();
            currentUnwatch = null;
          }

          if (!isActive) {
            console.log(
              `[MarketFactoryWatcher] Watcher for ${descriptiveName} permanently stopped during error handling.`
            );
            return;
          }

          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(
              `[MarketFactoryWatcher] Attempting to reconnect for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
            );
            setTimeout(
              () => {
                startFactoryWatcher();
              },
              RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1)
            ); // Exponential backoff
          } else {
            console.error(
              `[MarketFactoryWatcher] Max reconnection attempts reached for ${descriptiveName}. Stopping watch.`
            );
            Sentry.captureMessage(
              `[MarketFactoryWatcher] Max reconnection attempts reached for ${descriptiveName}`
            );
            isActive = false; // Stop trying if max attempts reached
          }
        },
      });
      console.log(
        `[MarketFactoryWatcher] Watcher setup complete for ${descriptiveName}`
      );
    } catch (error) {
      console.error(
        `[MarketFactoryWatcher] Critical error setting up watcher for ${descriptiveName}:`,
        error
      );
      Sentry.withScope((scope) => {
        scope.setExtra('factoryAddress', factoryAddress);
        scope.setExtra('chainId', chainId);
        Sentry.captureException(error);
      });
      // If setup itself fails, try to reconnect as well
      if (!isActive) return;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(
          `[MarketFactoryWatcher] Attempting to reconnect (after setup error) for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
        );
        setTimeout(
          () => {
            startFactoryWatcher();
          },
          RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1)
        );
      } else {
        console.error(
          `[MarketFactoryWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}. Stopping.`
        );
        Sentry.captureMessage(
          `[MarketFactoryWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}`
        );
        isActive = false;
      }
    }
  };

  startFactoryWatcher();

  return () => {
    console.log(
      `[MarketFactoryWatcher] Permanently stopping watcher for ${descriptiveName}.`
    );
    isActive = false;
    if (currentUnwatch) {
      try {
        currentUnwatch();
        console.log(
          `[MarketFactoryWatcher] Unwatched ${descriptiveName} successfully.`
        );
      } catch (error) {
        console.error(
          `[MarketFactoryWatcher] Error unwatching ${descriptiveName}:`,
          error
        );
        Sentry.withScope((scope) => {
          scope.setExtra('factoryAddress', factoryAddress);
          scope.setExtra('chainId', chainId);
          Sentry.captureException(error);
        });
      }
      currentUnwatch = null;
    }
  };
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
        const unwatch = await startIndexingForMarketGroup(marketGroup, client);
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
      const unwatch = await watchFactoryAddress(chainId, factoryAddress);
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
