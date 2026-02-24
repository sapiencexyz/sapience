import prisma from './db';
import fixturesData from './fixtures.json';
import { IIndexer } from './interfaces';
import EASPredictionIndexer from './workers/indexers/easIndexer';
import PredictionMarketIndexer from './workers/indexers/predictionMarketIndexer';
import CollateralTransferIndexer from './workers/indexers/collateralTransferIndexer';

export const INDEXERS: {
  [key: string]: IIndexer;
} = {
  'attestation-prediction-market': new EASPredictionIndexer(42161),
  'prediction-market-events-arbitrum': new PredictionMarketIndexer(42161), // Arbitrum
  'prediction-market-events-ethereal': new PredictionMarketIndexer(5064014), // Ethereal
  'collateral-transfer-ethereal': new CollateralTransferIndexer(5064014), // wUSDe transfers
};

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
