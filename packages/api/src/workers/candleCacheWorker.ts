import 'reflect-metadata';
import { initializeDataSource } from '../db';
import { initializeFixtures } from '../fixtures';
import { CandleCacheBuilder } from '../candle-cache/candleCacheBuilder';
import { createResilientProcess } from '../utils/utils';

async function runCandleCacheBuilder(intervalSeconds: number) {
  await initializeDataSource();
  await initializeFixtures();

  const candleCacheBuilder = CandleCacheBuilder.getInstance();
  
  while (true) {
    try {
      console.log(`Running candle cache update at ${new Date().toISOString()}`);
      await candleCacheBuilder.updateCandles();
      console.log(`Candle cache update completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Error in candle cache update:', error);
    }
    
    // Wait for the specified interval
    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
  }
}

// Handle command line arguments
async function handleWorkerCommands(args: string[]): Promise<boolean> {
  if (args.length <= 2) return false;

  const command = args[2];

  if (command === 'candle-cache') {
    // Get interval from command line, default to 60 seconds if not specified
    const intervalSeconds = parseInt(args[3] || '60', 10);
    if (isNaN(intervalSeconds) || intervalSeconds <= 0) {
      console.error('Invalid interval specified. Please provide a positive number of seconds.');
      return true;
    }

    console.log(`Starting candle cache worker with ${intervalSeconds} second interval`);
    await createResilientProcess(
      () => runCandleCacheBuilder(intervalSeconds),
      'candleCacheBuilder'
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
      () => runCandleCacheBuilder(60),
      'candleCacheBuilder'
    )();
  }
})(); 