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
  getResolverAddressesForChain,
  getLegacyResolverAddressesForChain,
  predictionMarketEscrow,
  secondaryMarketEscrow,
  normalizeLegacyEntry,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

// Environment variable to control whether escrow indexers are enabled
const ENABLE_ESCROW_INDEXERS = process.env.ENABLE_ESCROW_INDEXERS === 'true';

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

    for (const { type, address } of getResolverAddressesForChain(chainId)) {
      indexers[`condition-settled-${type}-${chainId}`] =
        new ConditionSettledIndexer(chainId, address);
    }

    // Register legacy escrow indexers
    const escrowEntry = predictionMarketEscrow[chainId];
    for (const legEntry of escrowEntry?.legacy ?? []) {
      const { address, blockCreated } = normalizeLegacyEntry(legEntry);
      const slug = address.slice(0, 10).toLowerCase();
      indexers[`escrow-legacy-${slug}-${chainId}`] =
        new PredictionMarketEscrowIndexer(
          chainId,
          address as `0x${string}`,
          true,
          blockCreated
        );
      indexers[`transfer-legacy-${slug}-${chainId}`] =
        new PositionTokenTransferIndexer(
          chainId,
          address as `0x${string}`,
          true,
          blockCreated
        );
    }

    // Register legacy secondary market indexers
    const secondaryEntry = secondaryMarketEscrow[chainId];
    for (const legEntry of secondaryEntry?.legacy ?? []) {
      const { address, blockCreated } = normalizeLegacyEntry(legEntry);
      const slug = address.slice(0, 10).toLowerCase();
      indexers[`secondary-legacy-${slug}-${chainId}`] =
        new SecondaryMarketIndexer(
          chainId,
          address as `0x${string}`,
          true,
          blockCreated
        );
    }

    // Register legacy resolver indexers
    for (const {
      type,
      address,
      blockCreated,
    } of getLegacyResolverAddressesForChain(chainId)) {
      const slug = address.slice(0, 10).toLowerCase();
      indexers[`condition-settled-legacy-${type}-${slug}-${chainId}`] =
        new ConditionSettledIndexer(
          chainId,
          address as `0x${string}`,
          true,
          blockCreated
        );
    }

    const legacyEscrowCount = escrowEntry?.legacy?.length ?? 0;
    const legacySecondaryCount = secondaryEntry?.legacy?.length ?? 0;
    const legacyResolverCount =
      getLegacyResolverAddressesForChain(chainId).length;
    console.log(
      `[Indexers] Escrow indexers enabled for chain ${chainId} (${getResolverAddressesForChain(chainId).length} resolvers, ${legacyEscrowCount} legacy escrow, ${legacySecondaryCount} legacy secondary, ${legacyResolverCount} legacy resolvers)`
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
