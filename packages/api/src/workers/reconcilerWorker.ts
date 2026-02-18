import 'reflect-metadata';
import { initializeDataSource } from '../db';
import { initializeFixtures } from '../fixtures';

import { createResilientProcess } from '../utils/utils';

import { PositionReconciler } from './reconcilers/position/positionReconciler';

async function runReconcilerWorker(intervalSeconds: number) {
  await initializeDataSource();
  await initializeFixtures();

  const positionReconciler = PositionReconciler.getInstance();

  while (true) {
    try {
      console.log('[WORKER] Starting position reconciliation...');
      await positionReconciler.runOnce();
      console.log('[WORKER] Position reconciliation completed');
      console.log(`Update completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Error in update:', error);
    }

    // Wait for the specified interval
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

// Handle command line arguments
async function handleWorkerCommands(args: string[]): Promise<boolean> {
  if (args.length <= 2) return false;

  const command = args[2];

  if (command === 'reconciler') {
    // Get interval from command line, default to 15 seconds if not specified
    const intervalSeconds = parseInt(args[3] || '15', 10);
    if (isNaN(intervalSeconds) || intervalSeconds <= 0) {
      console.error(
        'Invalid interval specified. Please provide a positive number of seconds.'
      );
      return true;
    }

    console.log(
      `Starting reconciler worker with ${intervalSeconds} second interval`
    );
    await createResilientProcess(
      () => runReconcilerWorker(intervalSeconds),
      'reconcilerWorker'
    )();
    return true;
  }

  return false;
}

// Start the worker
(async () => {
  const workerHandled = await handleWorkerCommands(process.argv);

  // If no worker command was handled, proceed with the default main logic
  if (!workerHandled) {
    console.log('Starting candle cache worker with default 60 second interval');
    await createResilientProcess(
      () => runReconcilerWorker(15),
      'ReconcilerWorker'
    )();
  }
})();
