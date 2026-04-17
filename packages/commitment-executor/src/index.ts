/**
 * Commitment-executor keeper entrypoint.
 *
 * Boot sequence:
 *   1. Load + validate config (fail fast on missing EXECUTOR_PRIVATE_KEY, etc).
 *   2. Start metrics and health HTTP servers.
 *   3. Connect to the relayer mirror feed; push broadcasts into state.
 *   4. Start the decision engine (executor) and the expire sweeper.
 *   5. Wire graceful SIGTERM/SIGINT shutdown.
 *
 * The keeper is stateless across restarts on purpose — see README for
 * the architectural note on missed commitments during downtime.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { RelayerClient } from './relayerClient';
import { CommitmentState } from './state';
import { ExecutorService } from './executor';
import { ExpireSweeper } from './expireSweeper';
import { startMetricsServer, startHealthServer } from './httpServer';
import {
  commitmentsObserved,
  quotesObserved,
} from './metrics';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, {
    chainId: config.chainId,
    executor: config.executorAccountAddress,
  });

  logger.info('commitment-executor starting', {
    executor: config.executorAccountAddress,
    contract: config.committedIntentExecutorAddress,
    relayer: config.relayerWsUrl,
  });

  const account = privateKeyToAccount(config.executorPrivateKey);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });

  const state = new CommitmentState({ logger });
  const relayer = new RelayerClient({ url: config.relayerWsUrl, logger });

  relayer.on('commitment.created', (payload) => {
    commitmentsObserved.inc();
    state.onCommitmentCreated(payload);
  });
  relayer.on('commitment.quote', (payload) => {
    quotesObserved.inc();
    state.onQuote(payload);
  });
  relayer.on('commitment.executed', (payload) => state.onExecuted(payload));
  relayer.on('commitment.expired', (payload) => state.onExpired(payload));
  relayer.on('commitment.slashed', (payload) => state.onSlashed(payload));

  // Picks resolver: the mirror broadcast does NOT carry `Pick[]` — only
  // `pickConfigId`. Until the relayer extension lands, the keeper has no
  // way to reconstruct the picks array that `execute(...)` needs. We
  // log + skip. When an upstream layer wires in a resolver (e.g. the
  // API's indexer), this function returns the picks for a given
  // `pickConfigId`.
  const picksResolver = (): null => null;

  const executor = new ExecutorService({
    config,
    logger,
    state,
    walletClient,
    publicClient,
    picksFor: picksResolver,
  });
  const sweeper = new ExpireSweeper({
    config,
    logger,
    state,
    walletClient,
    publicClient,
  });

  const metricsServer = startMetricsServer(config.metricsPort, logger);
  const healthServer = startHealthServer(
    config.healthPort,
    logger,
    () => relayer.isOpen()
  );

  executor.start();
  sweeper.start();
  relayer.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down`);
    try {
      sweeper.stop();
      executor.stop();
      relayer.stop();
      await Promise.all([metricsServer.close(), healthServer.close()]);
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('shutdown error', { err: (err as Error).message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[commitment-executor] fatal:', err);
  process.exit(1);
});
