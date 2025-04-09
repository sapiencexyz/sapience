import { mainnet, base, arbitrum } from 'viem/chains';
import evmIndexer from './resourcePriceFunctions/evmIndexer';
import ethBlobsIndexer from './resourcePriceFunctions/ethBlobsIndexer';
import celestiaIndexer from './resourcePriceFunctions/celestiaIndexer';
import btcIndexer from './resourcePriceFunctions/btcIndexer';
import fixturesData from './fixtures.json';
import { Resource } from './models/Resource';
import { resourceRepository } from './db';
import { Market } from './models/Market';
import { marketRepository } from './db';
import { Epoch } from './models/Epoch';
import { epochRepository } from './db';
import { Category } from './models/Category';
import { categoryRepository } from './db';
import { IResourcePriceIndexer } from './interfaces';

// TAT = Trailing Average Time
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
};

// Helper function to create or update epochs with questions
async function handleEpochQuestions(
  market: Market,
  questions: string[]
): Promise<void> {
  if (!questions || questions.length === 0) {
    return;
  }

  // Create or update epochs for each question
  for (let i = 0; i < questions.length; i++) {
    const epochId = i + 1; // Convert 0-index to 1-index for epochId

    // Check if epoch already exists
    let epoch = await epochRepository.findOne({
      where: {
        market: { id: market.id },
        epochId: epochId,
      },
    });

    if (!epoch) {
      // Create new epoch
      epoch = new Epoch();
      epoch.epochId = epochId;
      epoch.market = market;
      epoch.question = questions[i];
      await epochRepository.save(epoch);
      console.log(`Created epoch ${epochId} with question: ${questions[i]}`);
    } else if (epoch.question !== questions[i]) {
      // Update epoch question if different
      epoch.question = questions[i];
      await epochRepository.save(epoch);
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
    let resource = await resourceRepository.findOne({
      where: { name: resourceData.name },
    });

    if (!resource) {
      // Create new resource if it doesn't exist
      resource = new Resource();
      resource.name = resourceData.name;
      resource.slug = resourceData.slug;
      await resourceRepository.save(resource);
      console.log('Created resource:', resourceData.name);
    } else if (resource.slug !== resourceData.slug) {
      // Update resource if slug doesn't match
      resource.slug = resourceData.slug;
      await resourceRepository.save(resource);
      console.log('Updated resource slug for:', resourceData.name);
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

    // Check if market already exists by address and chainId
    let market = await marketRepository.findOne({
      where: {
        address: marketData.address.toLowerCase(),
        chainId: marketData.chainId,
      },
    });

    if (!market) {
      // Create new market
      market = new Market();
      market.address = marketData.address.toLowerCase();
      market.chainId = marketData.chainId;
      market.isYin = marketData.isYin || false;
      market.isCumulative = marketData.isCumulative || false;
      market.category = category;

      // Set the resource for the market
      market.resource = resource;
      await marketRepository.save(market);
      console.log(
        'Created market:',
        market.address,
        'on chain',
        market.chainId
      );

      // Handle questions for epochs after market is saved
      if (marketData.questions && market.id) {
        await handleEpochQuestions(market, marketData.questions);
      }
    } else {
      // Update market if needed
      market.resource = resource;
      market.isYin = marketData.isYin || market.isYin || false;
      market.isCumulative =
        marketData.isCumulative || market.isCumulative || false;
      market.category = category;

      await marketRepository.save(market);
      console.log(
        'Updated market:',
        market.address,
        'on chain',
        market.chainId
      );

      // Handle questions for epochs after market is updated
      if (marketData.questions && market.id) {
        await handleEpochQuestions(market, marketData.questions);
      }
    }
  }
};
