import prisma from './db';
import fixturesData from './fixtures.json';
import { IIndexer } from './interfaces';
import EASPredictionIndexer from './workers/indexers/easIndexer';
import PredictionMarketEscrowIndexer from './workers/indexers/predictionMarketEscrowIndexer';
import SecondaryMarketIndexer from './workers/indexers/secondaryMarketIndexer';
import PositionTokenTransferIndexer from './workers/indexers/positionTokenTransferIndexer';
import ConditionSettledIndexer from './workers/indexers/conditionSettledIndexer';
import CollateralTransferIndexer from './workers/indexers/collateralTransferIndexer';
import {
  conditionalTokensConditionResolver,
  pythConditionResolver,
  manualConditionResolver,
} from '@sapience/sdk/contracts';

// Environment variable to control whether escrow indexers are enabled
const ENABLE_ESCROW_INDEXERS = process.env.ENABLE_ESCROW_INDEXERS === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Build indexers object based on environment configuration
const buildIndexers = (): { [key: string]: IIndexer } => {
  const indexers: { [key: string]: IIndexer } = {};

  indexers['attestation-prediction-market'] = new EASPredictionIndexer(42161);

  if (ENABLE_ESCROW_INDEXERS) {
    if (IS_PRODUCTION) {
      // ── Production (Ethereal mainnet) ──
      indexers['escrow-prediction-market-ethereal'] =
        new PredictionMarketEscrowIndexer(5064014);
      indexers['secondary-market-ethereal'] = new SecondaryMarketIndexer(
        5064014
      );
      indexers['transfer-ethereal'] = new PositionTokenTransferIndexer(5064014);
      indexers['collateral-transfer-ethereal'] = new CollateralTransferIndexer(
        5064014
      );

      // Settlement indexers — CT (Polymarket) + Pyth resolvers
      if (conditionalTokensConditionResolver[5064014]?.address) {
        indexers['condition-settled-ct-ethereal'] = new ConditionSettledIndexer(
          5064014,
          conditionalTokensConditionResolver[5064014].address as `0x${string}`
        );
      }
      if (pythConditionResolver[5064014]?.address) {
        indexers['condition-settled-pyth-ethereal'] =
          new ConditionSettledIndexer(
            5064014,
            pythConditionResolver[5064014].address as `0x${string}`
          );
      }

      console.log('[Indexers] Production escrow indexers enabled (mainnet)');
    } else {
      // ── Non-production (Ethereal testnet) ──
      indexers['escrow-prediction-market-ethereal-testnet'] =
        new PredictionMarketEscrowIndexer(13374202);
      indexers['secondary-market-ethereal-testnet'] =
        new SecondaryMarketIndexer(13374202);
      indexers['transfer-ethereal-testnet'] = new PositionTokenTransferIndexer(
        13374202
      );
      indexers['collateral-transfer-ethereal-testnet'] =
        new CollateralTransferIndexer(13374202);

      // Settlement indexer — manual resolver for testing
      if (manualConditionResolver[13374202]?.address) {
        indexers['condition-settled-manual-testnet'] =
          new ConditionSettledIndexer(
            13374202,
            manualConditionResolver[13374202].address as `0x${string}`
          );
      }

      console.log(
        '[Indexers] Non-production escrow indexers enabled (testnet)'
      );
    }
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
