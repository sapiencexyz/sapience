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
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

// Environment variable to control whether escrow indexers are enabled
const ENABLE_ESCROW_INDEXERS = process.env.ENABLE_ESCROW_INDEXERS === 'true';
const IS_MAINNET = DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL;

// Build indexers object based on environment configuration
const buildIndexers = (): { [key: string]: IIndexer } => {
  const indexers: { [key: string]: IIndexer } = {};

  indexers['attestation-prediction-market'] = new EASPredictionIndexer(42161);

  if (ENABLE_ESCROW_INDEXERS) {
    const chainId = DEFAULT_CHAIN_ID;

    indexers[`escrow-prediction-market-${chainId}`] =
      new PredictionMarketEscrowIndexer(chainId);
    indexers[`secondary-market-${chainId}`] = new SecondaryMarketIndexer(
      chainId
    );
    indexers[`transfer-${chainId}`] = new PositionTokenTransferIndexer(chainId);
    indexers[`collateral-transfer-${chainId}`] = new CollateralTransferIndexer(
      chainId
    );

    if (IS_MAINNET) {
      // Settlement indexers — CT (Polymarket) + Pyth resolvers
      if (conditionalTokensConditionResolver[chainId]?.address) {
        indexers['condition-settled-ct-ethereal'] = new ConditionSettledIndexer(
          chainId,
          conditionalTokensConditionResolver[chainId].address as `0x${string}`
        );
      }
      if (pythConditionResolver[chainId]?.address) {
        indexers['condition-settled-pyth-ethereal'] =
          new ConditionSettledIndexer(
            chainId,
            pythConditionResolver[chainId].address as `0x${string}`
          );
      }
    } else {
      // Settlement indexer — manual resolver for testing
      if (manualConditionResolver[chainId]?.address) {
        indexers['condition-settled-manual-testnet'] =
          new ConditionSettledIndexer(
            chainId,
            manualConditionResolver[chainId].address as `0x${string}`
          );
      }
    }

    console.log(
      `[Indexers] Escrow indexers enabled for chain ${chainId} (${IS_MAINNET ? 'mainnet' : 'testnet'})`
    );
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
