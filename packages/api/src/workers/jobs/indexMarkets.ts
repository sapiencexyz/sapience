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
) {
  console.log(
    `Starting event indexing for Market Group: ${marketGroup.chainId}:${marketGroup.address}`
  );
  try {
    await indexMarketEvents(marketGroup, client);
  } catch (error) {
    console.error(
      `Error starting indexing for market group ${marketGroup.address}:`,
      error
    );
  }
}

// Get the approved addresses from environment variable
const getApprovedAddresses = (): string[] => {
  const approvedAddresses = process.env.ALLOWED_ADDRESSES || '';
  return approvedAddresses
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address !== '');
};

async function handleMarketGroupInitialized(
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
  const approvedAddresses = getApprovedAddresses();
  if (approvedAddresses.length > 0 && !approvedAddresses.includes(sender)) {
    console.log(
      `Skipping MarketGroupInitialized event: sender ${sender} is not in the approved list.`
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
 */
export async function watchFactoryAddress(
  chainId: number,
  factoryAddress: string
) {
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
    return;
  }

  try {
    console.log(
      `Watching MarketGroupInitialized events on factory ${factoryAddress}`
    );

    client.watchContractEvent({
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
  } catch (error) {
    console.error(
      `Error setting up watcher for factory ${factoryAddress} on chain ${chainId}:`,
      error
    );
    throw error;
  }
}

export async function startIndexingAndWatchingMarketGroups(chainId: number) {
  const client = getProviderForChain(chainId);

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
      await startIndexingForMarketGroup(marketGroup, client);
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
    await watchFactoryAddress(chainId, factoryAddress);
  }

  console.log(
    `Initialization and watching setup complete for chainId ${chainId}.`
  );
}
