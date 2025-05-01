import { MarketGroup } from '../../models/MarketGroup';
import { marketGroupRepository } from '../../db';
import { getProviderForChain } from '../../utils';
import { Log, decodeEventLog, PublicClient } from 'viem';
import { indexMarketEvents } from '../../controllers/market'; // Import the function

// ABI for the MarketGroupFactory contract
const marketGroupFactoryAbi = [
  {
    type: 'event',
    name: 'MarketGroupInitialized',
    inputs: [
      {
        name: 'marketGroup',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'returnData',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
      },
      {
        name: 'nonce',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
] as const;

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

async function handleMarketGroupInitialized(
  eventArgs: {
    marketGroup: `0x${string}`;
    returnData: `0x${string}`;
    nonce: bigint;
  },
  chainId: number,
  factoryAddress: string,
  client: PublicClient
) {
  console.log('MarketGroupInitialized event caught:', eventArgs);

  const nonce = eventArgs.nonce.toString();
  const newMarketGroupAddress = eventArgs.marketGroup.toLowerCase();

  try {
    let marketGroupRecord = await marketGroupRepository.findOne({
      where: { initializationNonce: nonce, chainId },
      relations: ['marketParams'], // Fetch relations needed by startIndexingForMarketGroup
    });

    if (marketGroupRecord) {
      console.log(
        `Found market group with nonce ${nonce} and chainId ${chainId}, updating address to ${newMarketGroupAddress}`
      );
      marketGroupRecord.address = newMarketGroupAddress;
      if (!marketGroupRecord.factoryAddress) {
        marketGroupRecord.factoryAddress = factoryAddress.toLowerCase();
      }
      await marketGroupRepository.save(marketGroupRecord);
      console.log(`Market group ${marketGroupRecord.id} updated successfully.`);
    } else {
      console.log(
        `Market group with nonce ${nonce} and chainId ${chainId} not found. Creating new market group.`
      );
      // Client is now passed in, no need to fetch it here unless specifically needed for new group creation logic beyond indexing
      const newMarketGroup = new MarketGroup();
      newMarketGroup.address = newMarketGroupAddress;
      newMarketGroup.initializationNonce = nonce;
      newMarketGroup.chainId = chainId;
      newMarketGroup.factoryAddress = factoryAddress.toLowerCase();

      // TODO: Consider fetching initial market params from the contract if needed using the passed 'client'

      marketGroupRecord = await marketGroupRepository.save(newMarketGroup);
      console.log(
        `New market group created successfully with ID ${marketGroupRecord.id}.`
      );

      // Re-fetch with relations after creation to ensure consistency
      marketGroupRecord = await marketGroupRepository.findOne({
        where: { id: marketGroupRecord.id },
        relations: ['marketParams'],
      });
    }

    // Start indexing for the newly added/updated market group
    if (marketGroupRecord) {
      await startIndexingForMarketGroup(marketGroupRecord, client); // Pass client argument
    }
  } catch (error) {
    console.error(
      `Error processing MarketGroupInitialized event for nonce ${nonce} on chain ${chainId}:`,
      error
    );
  }
}

// Renamed function
export async function startIndexingAndWatchingMarketGroups(chainId: number) {
  const client = getProviderForChain(chainId);

  const marketGroups = await marketGroupRepository.find({
    where: { chainId },
    // Select fields and relations needed by startIndexingForMarketGroup/indexMarketEvents
    select: [
      'id',
      'address',
      'factoryAddress',
      'initializationNonce',
      'chainId',
    ],
    relations: ['marketParams'], // Add marketParams relation
  });

  console.log(
    `Found ${marketGroups.length} existing market groups for chainId ${chainId}. Starting indexing...`
  );
  // Index existing market groups
  for (const marketGroup of marketGroups) {
    // Only start indexing if address is not null/empty (might be set later by factory event)
    if (
      marketGroup.address &&
      marketGroup.address !== '0x0000000000000000000000000000000000000000'
    ) {
      // Pass the fetched marketGroup with relations and the client
      await startIndexingForMarketGroup(marketGroup, client); // Pass client argument
    }
  }

  // Get unique factory addresses, filtering out null values
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

  // Watch for MarketGroupInitialized events on each factory
  factoryAddresses.forEach((factoryAddress) => {
    console.log(
      `Watching MarketGroupInitialized events on factory ${factoryAddress}`
    );
    client.watchContractEvent({
      address: factoryAddress as `0x${string}`,
      abi: marketGroupFactoryAbi,
      eventName: 'MarketGroupInitialized',
      onLogs: (logs: Log[]) => {
        logs.forEach((log) => {
          try {
            const decodedLog = decodeEventLog({
              abi: marketGroupFactoryAbi,
              data: log.data,
              topics: log.topics,
            });
            const eventArgs = decodedLog.args as {
              marketGroup: `0x${string}`;
              returnData: `0x${string}`;
              nonce: bigint;
            };
            // Pass client instance to handler call
            handleMarketGroupInitialized(
              eventArgs,
              chainId,
              factoryAddress,
              client
            ); // Pass client argument
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
  });

  console.log(
    `Initialization and watching setup complete for chainId ${chainId}.`
  );
}
