import prisma from './db';
import fixturesData from './fixtures.json';
import { IIndexer } from './interfaces';
import EASPredictionIndexer from './workers/indexers/easIndexer';
import PredictionMarketIndexer from './workers/indexers/predictionMarketIndexer';
import V2PredictionMarketIndexer from './workers/indexers/v2PredictionMarketIndexer';

// Environment variables to control which indexers are enabled
const ENABLE_V1_INDEXERS = process.env.ENABLE_V1_INDEXERS !== 'false';
const ENABLE_V2_INDEXERS = process.env.ENABLE_V2_INDEXERS !== 'false';

// Build indexers object based on environment configuration
const buildIndexers = (): { [key: string]: IIndexer } => {
  const indexers: { [key: string]: IIndexer } = {};

  if (ENABLE_V1_INDEXERS) {
    indexers['attestation-prediction-market'] = new EASPredictionIndexer(42161);
    indexers['prediction-market-events-arbitrum'] = new PredictionMarketIndexer(42161); // Arbitrum
    indexers['prediction-market-events-ethereal'] = new PredictionMarketIndexer(5064014); // Ethereal
    console.log('[Indexers] V1 indexers enabled');
  } else {
    console.log('[Indexers] V1 indexers disabled (ENABLE_V1_INDEXERS=false)');
  }

  if (ENABLE_V2_INDEXERS) {
    indexers['v2-prediction-market-ethereal'] = new V2PredictionMarketIndexer(5064014); // Ethereal mainnet (V2)
    indexers['v2-prediction-market-ethereal-testnet'] = new V2PredictionMarketIndexer(13374202); // Ethereal testnet (V2)
    console.log('[Indexers] V2 indexers enabled');
  } else {
    console.log('[Indexers] V2 indexers disabled (ENABLE_V2_INDEXERS=false)');
  }

  return indexers;
};

export const INDEXERS: { [key: string]: IIndexer } = buildIndexers();

// Function to initialize fixtures - upsert categories from fixtures.json
export const initializeFixtures = async (): Promise<void> => {
  console.log('Initializing fixtures from fixtures.json');

  for (const categoryData of fixturesData.CATEGORIES) {
    let category = await prisma.category.findFirst({
      where: { slug: categoryData.slug },
    });

    if (!category) {
      category = await prisma.category.create({
        data: {
          name: categoryData.name,
          slug: categoryData.slug,
        },
      });
      console.log('Created category:', categoryData.name);
    }
  }
};
