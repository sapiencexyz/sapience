/**
 * Escrow Auction scenario (P0) — validates the critical user path.
 *
 * 1. Ramp: Open N connections, staggered
 * 2. Create: M connections start auctions at controlled rate
 * 3. Subscribe: Remaining connections subscribe to auctions
 * 4. Bid: Submit K bids per auction from counterparty accounts
 * 5. Measure: latencies across all steps
 * 6. Drain: Stop creating, let auctions expire
 */

import type { LoadTestConfig } from '../config';
import { MetricsCollector } from '../metrics';
import {
  createAccountPool,
  randomPredictor,
  randomCounterparty,
} from '../accounts';
import {
  generateAuctionPayload,
  generateBidPayload,
  preBatchAuctionPayloads,
} from '../generators';
import { WsPool } from '../wsPool';
import {
  printHeader,
  printLiveStats,
  printFinalReport,
  type LiveStats,
} from '../reporter';

export async function run(config: LoadTestConfig): Promise<void> {
  const { preset, duration, rampUp } = config;
  const metrics = new MetricsCollector();

  printHeader('escrow-auction', config.scale, duration, config.target);

  // Create account pool
  const predictorCount = Math.max(
    10,
    Math.round(preset.concurrentAuctions / 2)
  );
  const counterpartyCount = Math.max(
    20,
    preset.concurrentAuctions * preset.bidsPerAuction
  );
  const pool = createAccountPool(predictorCount, counterpartyCount);
  console.log(
    `Accounts: ${pool.predictors.length} predictors, ${pool.counterparties.length} counterparties`
  );

  // Pre-batch auction payloads at scale >= 10 to avoid signing bottleneck
  let preBatched: Awaited<ReturnType<typeof preBatchAuctionPayloads>> | null =
    null;
  if (config.scale >= 10) {
    console.log(`Pre-signing ${preset.concurrentAuctions} auction payloads...`);
    preBatched = await preBatchAuctionPayloads(pool, preset.concurrentAuctions);
    console.log('Pre-signing complete.');
  }

  // Phase 1: Ramp — open connections
  console.log(`\nRamping up ${preset.connections} connections...`);
  const wsPool = new WsPool(config.target, metrics);
  const staggerMs = rampUp > 0 ? (rampUp * 1000) / preset.connections : 10;
  await wsPool.connect(preset.connections, staggerMs);
  console.log(
    `Connections: ${wsPool.poolStats.active} active, ${wsPool.poolStats.failed} failed`
  );

  if (wsPool.poolStats.active === 0) {
    console.error('No connections established. Aborting.');
    return;
  }

  // Track live stats
  const liveStats: LiveStats = {
    connections: { ...wsPool.poolStats },
    auctions: { started: 0, acked: 0, errors: 0 },
    bids: { sent: 0, acked: 0, rejected: 0 },
    msgsSent: 0,
    msgsRecv: 0,
    elapsed: 0,
  };

  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  // Live progress
  const progressInterval = setInterval(() => {
    const ps = wsPool.poolStats;
    liveStats.connections = {
      active: ps.active,
      failed: ps.failed,
      rateLimited: ps.rateLimited,
    };
    liveStats.msgsSent = ps.msgsSent;
    liveStats.msgsRecv = ps.msgsRecv;
    liveStats.elapsed = (Date.now() - startTime) / 1000;
    printLiveStats(liveStats);
  }, 1000);

  // Listen for broadcast events
  const auctionMap = new Map<
    string,
    {
      picks: {
        conditionResolver: string;
        conditionId: string;
        predictedOutcome: number;
      }[];
      predictor: string;
      predictorCollateral: string;
      chainId: number;
    }
  >();

  wsPool.onMessage((_conn, msg) => {
    const msgType = msg.type as string;
    const payload = msg.payload as Record<string, unknown> | undefined;

    if (msgType === 'auction.started' && payload) {
      const auctionId = payload.auctionId as string;
      auctionMap.set(auctionId, {
        picks: payload.picks as {
          conditionResolver: string;
          conditionId: string;
          predictedOutcome: number;
        }[],
        predictor: payload.predictor as string,
        predictorCollateral: payload.predictorCollateral as string,
        chainId: payload.chainId as number,
      });
    }
  });

  // Phase 2+3+4: Create auctions, subscribe, bid
  const auctionInterval = Math.max(
    50,
    (duration * 1000) / preset.concurrentAuctions
  );
  let auctionIdx = 0;
  let batchIdx = 0;

  const createAndBid = async () => {
    while (Date.now() < endTime && auctionIdx < preset.concurrentAuctions) {
      const conn = wsPool.at(auctionIdx);
      if (!conn) {
        auctionIdx++;
        continue;
      }

      try {
        // Start auction
        let auctionPayload;
        if (preBatched && batchIdx < preBatched.length) {
          auctionPayload = preBatched[batchIdx++].payload;
        } else {
          const account = randomPredictor(pool);
          auctionPayload = await generateAuctionPayload(account);
        }

        liveStats.auctions.started++;

        const response = (await wsPool.sendAndWait(conn, {
          type: 'auction.start',
          payload: auctionPayload,
        })) as { payload?: { auctionId?: string; error?: string } };

        const responsePayload = response.payload;
        if (responsePayload?.error) {
          liveStats.auctions.errors++;
          auctionIdx++;
          continue;
        }

        liveStats.auctions.acked++;
        const auctionId = responsePayload?.auctionId;
        if (!auctionId) {
          auctionIdx++;
          continue;
        }

        // Subscribe some other connections
        const subscriberCount = Math.min(
          3,
          wsPool.activeConnections.length - 1
        );
        for (let s = 0; s < subscriberCount; s++) {
          const sub = wsPool.at(auctionIdx + s + 1);
          if (sub && sub.id !== conn.id) {
            wsPool.send(sub, {
              type: 'auction.subscribe',
              payload: { auctionId },
            });
            // Set broadcast tracking timestamp
            sub.sendTime.set(`bid.broadcast:${auctionId}`, Date.now());
          }
        }

        // Submit bids
        const auctionDetails = {
          auctionId,
          picks: auctionPayload.picks,
          predictor: auctionPayload.predictor,
          predictorCollateral: auctionPayload.predictorCollateral,
          chainId: auctionPayload.chainId,
        };

        for (let b = 0; b < preset.bidsPerAuction; b++) {
          if (Date.now() >= endTime) break;

          const counterparty = randomCounterparty(pool);
          const bidConn = wsPool.random();
          if (!bidConn) continue;

          try {
            const bidPayload = await generateBidPayload(
              counterparty,
              auctionDetails
            );
            liveStats.bids.sent++;

            const bidResponse = (await wsPool.sendAndWait(bidConn, {
              type: 'bid.submit',
              payload: bidPayload,
            })) as { payload?: { error?: string } };

            if (bidResponse.payload?.error) {
              liveStats.bids.rejected++;
            } else {
              liveStats.bids.acked++;
            }
          } catch {
            liveStats.bids.rejected++;
          }
        }
      } catch {
        liveStats.auctions.errors++;
      }

      auctionIdx++;
      // Pace auction creation
      await delay(auctionInterval);
    }
  };

  await createAndBid();

  // Wait for remaining duration
  const remaining = endTime - Date.now();
  if (remaining > 0) {
    await delay(remaining);
  }

  // Cleanup
  clearInterval(progressInterval);

  // Final stats
  const ps = wsPool.poolStats;
  liveStats.connections = {
    active: ps.active,
    failed: ps.failed,
    rateLimited: ps.rateLimited,
  };
  liveStats.msgsSent = ps.msgsSent;
  liveStats.msgsRecv = ps.msgsRecv;
  liveStats.elapsed = (Date.now() - startTime) / 1000;

  printFinalReport(liveStats, metrics);

  // Shutdown
  console.log('Shutting down connections...');
  await wsPool.shutdown();
  console.log('Done.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
