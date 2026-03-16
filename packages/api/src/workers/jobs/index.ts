import { reindexEAS } from './reindexEAS';
import { backfillAccuracy } from './backfillAccuracy';
import { reindexTransfers } from './reindexTransfers';
import { reindexCollateralTransfers } from './reindexCollateralTransfers';
import { reindexAccuracy } from './reindexAccuracy';
import { reindexConditionSettled } from './reindexConditionSettled';
import {
  computeAndStoreProtocolStats,
  backfillProtocolStats,
} from '../../helpers/protocolStats';

const callReindexEAS = async (argv: string[]) => {
  const chainId = parseInt(argv[3], 10);
  const startTimestamp =
    argv[4] !== 'undefined' ? parseInt(argv[4], 10) : undefined;
  const endTimestamp =
    argv[5] !== 'undefined' ? parseInt(argv[5], 10) : undefined;
  const overwriteExisting = argv[6] === 'true';

  if (isNaN(chainId)) {
    console.error(
      'Invalid arguments. Usage: tsx src/worker.ts reindexEAS <chainId> [startTimestamp] [endTimestamp] [overwriteExisting]'
    );
    process.exit(1);
  }

  const result = await reindexEAS(
    chainId,
    startTimestamp,
    endTimestamp,
    overwriteExisting
  );

  if (!result) {
    console.error('Failed to reindex EAS');
    process.exit(1);
  }

  console.log('Done reindexing EAS');
  process.exit(0);
};

const callBackfillAccuracy = async () => {
  await backfillAccuracy();
  console.log('Done backfilling accuracy scores');
  process.exit(0);
};

export async function handleJobCommand(argv: string[]): Promise<boolean> {
  const command = argv[2];

  switch (command) {
    case 'reindexEAS': {
      await callReindexEAS(argv);
      return true;
    }
    case 'backfillAccuracy': {
      await callBackfillAccuracy();
      return true;
    }
    case 'reindexAccuracy': {
      const address = argv[3];
      const marketId = argv[4];
      await reindexAccuracy(address, marketId);
      console.log('Done reindexing accuracy scores');
      process.exit(0);
      return true;
    }
    case 'computeProtocolStats': {
      const chainId = argv[3] ? parseInt(argv[3], 10) : undefined;
      await computeAndStoreProtocolStats(chainId);
      console.log('Done computing protocol stats');
      process.exit(0);
      return true;
    }
    case 'backfillProtocolStats': {
      const days = argv[3] ? parseInt(argv[3], 10) : 90;
      const chainId = argv[4] ? parseInt(argv[4], 10) : undefined;
      await backfillProtocolStats(chainId, days);
      console.log('Done backfilling protocol stats');
      process.exit(0);
      return true;
    }
    case 'reindexConditionSettled': {
      const chainId = parseInt(argv[3], 10);
      const resolverAddress = argv[4] as `0x${string}`;
      const startTimestamp =
        argv[5] !== 'undefined' ? parseInt(argv[5], 10) : undefined;
      const endTimestamp =
        argv[6] !== 'undefined' ? parseInt(argv[6], 10) : undefined;
      if (isNaN(chainId) || !resolverAddress?.startsWith('0x')) {
        console.error(
          'Invalid arguments. Usage: tsx src/workers/worker.ts reindexConditionSettled <chainId> <resolverAddress> [startTimestamp] [endTimestamp]'
        );
        process.exit(1);
      }
      await reindexConditionSettled(
        chainId,
        resolverAddress,
        startTimestamp,
        endTimestamp
      );
      console.log('Done reindexing condition settled events');
      process.exit(0);
      return true;
    }
    case 'reindexTransfers': {
      const chainId = parseInt(argv[3], 10);
      const fromBlock = argv[4] ? parseInt(argv[4], 10) : undefined;
      if (isNaN(chainId)) {
        console.error(
          'Invalid arguments. Usage: tsx src/workers/worker.ts reindexTransfers <chainId> [fromBlock]'
        );
        process.exit(1);
      }
      const result = await reindexTransfers(chainId, fromBlock);
      if (!result) {
        console.error('Failed to reindex transfers');
        process.exit(1);
      }
      console.log('Done reindexing transfers');
      process.exit(0);
      return true;
    }
    case 'reindexCollateralTransfers': {
      const chainId = parseInt(argv[3], 10);
      const fromBlock = argv[4] ? parseInt(argv[4], 10) : undefined;
      if (isNaN(chainId)) {
        console.error(
          'Invalid arguments. Usage: tsx src/workers/worker.ts reindexCollateralTransfers <chainId> [fromBlock]'
        );
        process.exit(1);
      }
      const result = await reindexCollateralTransfers(chainId, fromBlock);
      if (!result) {
        console.error('Failed to reindex collateral transfers');
        process.exit(1);
      }
      console.log('Done reindexing collateral transfers');
      process.exit(0);
      return true;
    }
    default: {
      // No specific job command matched
      return false;
    }
  }
}
