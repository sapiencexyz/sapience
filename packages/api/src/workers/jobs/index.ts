import { reindexEAS } from './reindexEAS';
import { backfillAccuracy } from './backfillAccuracy';
import {
  computeAndStoreProtocolStats,
  backfillProtocolStats,
} from '../../services/protocolStats';

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
    case 'computeProtocolStats': {
      const chainId = argv[3] ? parseInt(argv[3], 10) : undefined;
      const intervalSeconds = argv[4] ? parseInt(argv[4], 10) : undefined;
      await computeAndStoreProtocolStats(chainId, intervalSeconds);
      console.log('Done computing protocol stats');
      process.exit(0);
      return true;
    }
    case 'backfillProtocolStats': {
      const days = argv[3] ? parseInt(argv[3], 10) : 90;
      const chainId = argv[4] ? parseInt(argv[4], 10) : undefined;
      const intervalSeconds = argv[5] ? parseInt(argv[5], 10) : undefined;
      await backfillProtocolStats(chainId, days, intervalSeconds);
      console.log('Done backfilling protocol stats');
      process.exit(0);
      return true;
    }
    default: {
      // No specific job command matched
      return false;
    }
  }
}
