import prisma from './db';
import fixturesData from './fixtures.json';
import { IIndexer } from './interfaces';
import EASPredictionIndexer from './workers/indexers/easIndexer';
import PredictionMarketIndexer from './workers/indexers/predictionMarketIndexer';
import PredictionMarketEscrowIndexer from './workers/indexers/predictionMarketEscrowIndexer';
import SecondaryMarketIndexer from './workers/indexers/secondaryMarketIndexer';
import V2PositionTokenTransferIndexer from './workers/indexers/v2PositionTokenTransferIndexer';

// Environment variables to control which indexers are enabled
const ENABLE_V1_INDEXERS = process.env.ENABLE_V1_INDEXERS !== 'false';
const ENABLE_ESCROW_INDEXERS = process.env.ENABLE_ESCROW_INDEXERS !== 'false';

// Build indexers object based on environment configuration
const buildIndexers = (): { [key: string]: IIndexer } => {
  const indexers: { [key: string]: IIndexer } = {};

  if (ENABLE_V1_INDEXERS) {
    indexers['attestation-prediction-market'] = new EASPredictionIndexer(42161);
    indexers['prediction-market-events-arbitrum'] = new PredictionMarketIndexer(
      42161
    ); // Arbitrum
    indexers['prediction-market-events-ethereal'] = new PredictionMarketIndexer(
      5064014
    ); // Ethereal
    console.log('[Indexers] V1 indexers enabled');
  } else {
    console.log('[Indexers] V1 indexers disabled (ENABLE_V1_INDEXERS=false)');
  }

  if (ENABLE_ESCROW_INDEXERS) {
    indexers['escrow-prediction-market-ethereal'] =
      new PredictionMarketEscrowIndexer(5064014); // Ethereal mainnet
    indexers['escrow-prediction-market-ethereal-testnet'] =
      new PredictionMarketEscrowIndexer(13374202); // Ethereal testnet
    indexers['secondary-market-ethereal-testnet'] =
      new SecondaryMarketIndexer(13374202); // Ethereal testnet (Secondary)
    indexers['v2-transfer-ethereal'] = new V2PositionTokenTransferIndexer(5064014); // ERC20 transfer indexer
    indexers['v2-transfer-ethereal-testnet'] = new V2PositionTokenTransferIndexer(13374202); // ERC20 transfer indexer (testnet)
    console.log('[Indexers] Escrow indexers enabled');
  } else {
    console.log(
      '[Indexers] Escrow indexers disabled (ENABLE_ESCROW_INDEXERS=false)'
    );
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
