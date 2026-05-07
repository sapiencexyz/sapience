import prisma from './core/db';
import fixturesData from './fixtures.json';
import { IIndexer } from './interfaces';
import EASPredictionIndexer from './workers/indexers/easIndexer';
import PredictionMarketEscrowIndexer from './workers/indexers/predictionMarketEscrowIndexer';
import SecondaryMarketIndexer from './workers/indexers/secondaryMarketIndexer';
import PositionTokenTransferIndexer from './workers/indexers/positionTokenTransferIndexer';
import ConditionSettledIndexer from './workers/indexers/conditionSettledIndexer';
import CollateralTransferIndexer from './workers/indexers/collateralTransferIndexer';
import CommittedIntentIndexer from './workers/indexers/committedIntentIndexer';
import {
  getResolverAddressesForChain,
  getLegacyResolverAddressesForChain,
  predictionMarketEscrow,
  secondaryMarketEscrow,
  normalizeLegacyEntry,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import { createLogger } from './core/logger';

const log = createLogger('fixtures');

// Environment variable to control whether escrow indexers are enabled
const ENABLE_ESCROW_INDEXERS = process.env.ENABLE_ESCROW_INDEXERS === 'true';

// Feature flag for the Committed Intent indexer (see prd-001-feature-flag.md).
// Default to true per the PRD: the indexer reads events even when the rest of
// the rollout is gated, so data is ready the moment downstream flags flip.
const ENABLE_COMMITTED_INTENT_INDEXER =
  (process.env.COMMITTED_INTENT_INDEXER_ENABLED ?? 'true') === 'true';

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
    log.info(
      `[Indexers] Escrow indexers enabled for chain ${chainId} (${getResolverAddressesForChain(chainId).length} resolvers, ${legacyEscrowCount} legacy escrow, ${legacySecondaryCount} legacy secondary, ${legacyResolverCount} legacy resolvers)`
    );
  } else {
    log.info(
      '[Indexers] Escrow indexers disabled (ENABLE_ESCROW_INDEXERS=false)'
    );
  }

  // Committed Intent indexer (feature-flagged).
  if (ENABLE_COMMITTED_INTENT_INDEXER) {
    const chainId = DEFAULT_CHAIN_ID;
    const executorAddress =
      process.env[`COMMITTED_INTENT_EXECUTOR_ADDRESS_${chainId}`] ??
      process.env.COMMITTED_INTENT_EXECUTOR_ADDRESS;

    if (executorAddress) {
      indexers[`committed-intent-${chainId}`] = new CommittedIntentIndexer(
        chainId
      );
      log.info(
        `[Indexers] Committed Intent indexer enabled for chain ${chainId} (executor ${executorAddress})`
      );
    } else {
      log.info(
        `[Indexers] Committed Intent indexer flag is ON but COMMITTED_INTENT_EXECUTOR_ADDRESS is unset — skipping`
      );
    }
  } else {
    log.info(
      '[Indexers] Committed Intent indexer disabled (COMMITTED_INTENT_INDEXER_ENABLED=false)'
    );
  }

  return indexers;
};

export const INDEXERS: { [key: string]: IIndexer } = buildIndexers();

// Function to initialize fixtures - upsert categories from fixtures.json
export const initializeFixtures = async (): Promise<void> => {
  log.info('Initializing fixtures from fixtures.json');

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
      log.info({ name: categoryData.name }, 'Created category');
    }
  }
};
