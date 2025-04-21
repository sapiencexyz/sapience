import { mainnet, base, arbitrum } from 'viem/chains';
import evmIndexer from './resourcePriceFunctions/evmIndexer';
import ethBlobsIndexer from './resourcePriceFunctions/ethBlobsIndexer';
import celestiaIndexer from './resourcePriceFunctions/celestiaIndexer';
import btcIndexer from './resourcePriceFunctions/btcIndexer';
import { WeatherIndexer } from './resourcePriceFunctions/weatherIndexer';
import fixturesData from './fixtures.json';
import { Resource } from './models/Resource';
import { resourceRepository } from './db';
import { MarketGroup } from './models/MarketGroup';
import { marketGroupRepository } from './db';
import { Market } from './models/Market';
import { marketRepository } from './db';
import { Category } from './models/Category';
import { categoryRepository } from './db';
import { IResourcePriceIndexer } from './interfaces';

export const TIME_INTERVALS = {
  intervals: {
    INTERVAL_1_MINUTE: 60,
    INTERVAL_5_MINUTES: 5 * 60,
    INTERVAL_15_MINUTES: 15 * 60,
    INTERVAL_30_MINUTES: 30 * 60,
    INTERVAL_4_HOURS: 4 * 60 * 60,
    INTERVAL_1_DAY: 24 * 60 * 60,
    INTERVAL_7_DAYS: 7 * 24 * 60 * 60,
    INTERVAL_28_DAYS: 28 * 24 * 60 * 60,
  },
};

export const INDEXERS: {
  [key: string]: IResourcePriceIndexer;
} = {
  'ethereum-gas': new evmIndexer(mainnet.id),
  'ethereum-blobspace': new ethBlobsIndexer(mainnet.id),
  'celestia-blobspace': new celestiaIndexer('https://api-mainnet.celenium.io'),
  'bitcoin-fees': new btcIndexer(),
  'base-gas': new evmIndexer(base.id),
  'arbitrum-gas': new evmIndexer(arbitrum.id),
  'nyc-air-temperature': new WeatherIndexer('temperature'),
  'sf-precipitation': new WeatherIndexer('precipitation'),
};

// Helper function to create or update epochs with questions
async function handleMarketQuestions(
  marketGroup: MarketGroup,
  questions: string[]
): Promise<void> {
  if (!questions || questions.length === 0) {
    return;
  }

  // Create or update epochs for each question
  for (let i = 0; i < questions.length; i++) {
    const epochId = i + 1; // Convert 0-index to 1-index for epochId

    // Check if epoch already exists
    let epoch = await marketRepository.findOne({
      where: {
        marketGroup: { id: marketGroup.id },
        marketId: epochId,
      },
    });

    if (!epoch) {
      // Create new epoch
      epoch = new Market();
      epoch.marketId = epochId;
      epoch.marketGroup = marketGroup;
      epoch.question = questions[i];
      await marketRepository.save(epoch);
      console.log(`Created epoch ${epochId} with question: ${questions[i]}`);
    } else if (epoch.question !== questions[i]) {
      // Update epoch question if different
      epoch.question = questions[i];
      await marketRepository.save(epoch);
      console.log(
        `Updated epoch ${epochId} with new question: ${questions[i]}`
      );
    }
  }
}

// TODO, bring this in below?
// import { createOrUpdateEpochFromContract } from '../controllers/marketHelpers';

// Function to initialize fixtures - upsert resources and markets from fixtures.json
export const initializeFixtures = async (): Promise<void> => {
  console.log('Initializing fixtures from fixtures.json');

  // Initialize resources from fixtures.json
  for (const resourceData of fixturesData.RESOURCES) {
    console.log('Initializing resource:', resourceData.name);
    let resource = await resourceRepository.findOne({
      where: { name: resourceData.name },
    });

    // Find the associated category
    const category = await categoryRepository.findOne({
      where: { slug: resourceData.category },
    });

    if (!category) {
      console.log(
        `Category not found for resource ${resourceData.name}: ${resourceData.category}`
      );
      continue; // Skip this resource if category not found
    }

    if (!resource) {
      // Create new resource if it doesn't exist
      resource = new Resource();
      resource.name = resourceData.name;
      resource.slug = resourceData.slug;
      resource.category = category; // Assign category
      await resourceRepository.save(resource);
      console.log('Created resource:', resourceData.name);
    } else {
      // Update resource if needed (e.g., slug or category change)
      let updated = false;
      if (resource.slug !== resourceData.slug) {
        resource.slug = resourceData.slug;
        updated = true;
      }
      // Check if category needs update (assuming resource.category might be loaded or null)
      // Ensure category is loaded for comparison or assignment
      if (!resource.category || resource.category.id !== category.id) {
        // Eager load category relation if not already loaded
        const currentResource = await resourceRepository.findOne({
          where: { id: resource.id },
          relations: ['category'],
        });
        if (
          currentResource &&
          (!currentResource.category ||
            currentResource.category.id !== category.id)
        ) {
          resource.category = category; // Assign new category
          updated = true;
        } else if (!currentResource) {
          // Handle case where resource might have been deleted between finds
          console.log(`Resource ${resource.name} not found for update.`);
          continue;
        }
      }

      if (updated) {
        await resourceRepository.save(resource);
        console.log('Updated resource:', resourceData.name);
      }
    }
  }

  // Initialize categories from fixtures.json
  for (const categoryData of fixturesData.CATEGORIES) {
    let category = await categoryRepository.findOne({
      where: { slug: categoryData.slug },
    });

    if (!category) {
      category = new Category();
      category.name = categoryData.name;
      category.slug = categoryData.slug;
      await categoryRepository.save(category);
      console.log('Created category:', categoryData.name);
    }
  }

  // Initialize markets from fixtures.json
  for (const marketData of fixturesData.MARKETS) {
    console.log('Initializing market:', marketData);
    // Find the associated resource
    const resource = await resourceRepository.findOne({
      where: { slug: marketData.resource },
    });

    const category = await categoryRepository.findOne({
      where: { slug: marketData.category },
    });

    if (!resource) {
      console.log(`Resource not found: ${marketData.resource}`);
      continue;
    }

    if (!category) {
      console.log(`Category not found: ${marketData.category}`);
      continue;
    }

    console.log('Initializing resource for market:', resource.name);

    // Check if market already exists by address and chainId
    let marketGroup = await marketGroupRepository.findOne({
      where: {
        address: marketData.address.toLowerCase(),
        chainId: marketData.chainId,
      },
    });

    if (!marketGroup) {
      // Create new market
      marketGroup = new MarketGroup();
      marketGroup.address = marketData.address.toLowerCase();
      marketGroup.chainId = marketData.chainId;
      marketGroup.isYin = marketData.isYin || false;
      marketGroup.isCumulative = marketData.isCumulative || false;
      marketGroup.category = category;
      marketGroup.question = marketData.question || null;
      marketGroup.baseTokenName = marketData.baseTokenName || null;
      marketGroup.quoteTokenName = marketData.quoteTokenName || null;
      marketGroup.optionNames = marketData.optionNames || null;

      // Set the resource for the market
      marketGroup.resource = resource;
      await marketGroupRepository.save(marketGroup);
      console.log(
        'Created market:',
        marketGroup.address,
        'on chain',
        marketGroup.chainId
      );

      // Handle questions for epochs after market is saved
      if (marketData.questions && marketGroup.id) {
        await handleMarketQuestions(marketGroup, marketData.questions);
      }
    } else {
      console.log('Market already exists:', marketGroup.address);
      // Set the resource for the market
      console.log('Setting resource for market2:', marketGroup.address, resource);
      
      marketGroup.resource = resource;
      marketGroup.isYin = marketData.isYin || marketGroup.isYin || false;
      marketGroup.isCumulative =
        marketData.isCumulative || marketGroup.isCumulative || false;
      marketGroup.category = category;
      marketGroup.question = marketData.question || marketGroup.question;
      marketGroup.baseTokenName =
        marketData.baseTokenName || marketGroup.baseTokenName || null;
      marketGroup.quoteTokenName =
        marketData.quoteTokenName || marketGroup.quoteTokenName || null;
      marketGroup.optionNames =
        marketData.optionNames || marketGroup.optionNames || null;

      await marketGroupRepository.save(marketGroup);
      console.log(
        'Updated market:',
        marketGroup.address,
        'on chain',
        marketGroup.chainId
      );

      // Handle questions for epochs after market is updated
      if (marketData.questions && marketGroup.id) {
        await handleMarketQuestions(marketGroup, marketData.questions);
      }
    }
  }
};
