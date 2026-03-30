/**
 * Mixed Workload scenario (P2) — most realistic.
 *
 * 40% WS auction flow, 30% GraphQL queries, 20% secondary market, 10% heavy nested queries.
 * Tests cross-cutting: does WS broadcast degrade API response times?
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
  GRAPHQL_QUERIES,
} from '../generators';
import { WsPool } from '../wsPool';
import { HttpDriver } from '../httpDriver';
import {
  printHeader,
  printLiveStats,
  printFinalReport,
  type LiveStats,
} from '../reporter';

export async function run(config: LoadTestConfig): Promise<void> {
  const { preset, duration } = config;
  const metrics = new MetricsCollector();

  printHeader(
    'mixed-workload',
    config.scale,
    duration,
    config.target,
    config.apiUrl
  );

  const pool = createAccountPool(
    Math.max(10, preset.concurrentAuctions),
    Math.max(20, preset.concurrentAuctions * 3)
  );

  const liveStats: LiveStats = {
    connections: { active: 0, failed: 0, rateLimited: 0 },
    auctions: { started: 0, acked: 0, errors: 0 },
    bids: { sent: 0, acked: 0, rejected: 0 },
    msgsSent: 0,
    msgsRecv: 0,
    elapsed: 0,
  };

  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  // Open WS connections
  console.log(`Opening ${preset.connections} WS connections...`);
  const wsPool = new WsPool(config.target, metrics);
  await wsPool.connect(preset.connections, 10);
  console.log(`Active: ${wsPool.poolStats.active}`);

  // HTTP driver
  const httpDriver = config.apiUrl
    ? new HttpDriver(config.apiUrl, preset.httpConcurrency, metrics)
    : null;

  // Live progress
  const progressInterval = setInterval(() => {
    const ps = wsPool.poolStats;
    liveStats.connections = {
      active: ps.active,
      failed: ps.failed,
      rateLimited: ps.rateLimited,
    };
    liveStats.msgsSent = ps.msgsSent + (httpDriver?.driverStats.total ?? 0);
    liveStats.msgsRecv = ps.msgsRecv + (httpDriver?.driverStats.success ?? 0);
    liveStats.elapsed = (Date.now() - startTime) / 1000;
    printLiveStats(liveStats);
  }, 1000);

  // Active auction IDs for subscribe/bid
  const activeAuctions: string[] = [];

  // Concurrently run all workload types
  const workers: Promise<void>[] = [];

  // 40% — WS auction flow
  workers.push(
    (async () => {
      while (Date.now() < endTime) {
        const conn = wsPool.random();
        if (!conn) {
          await delay(100);
          continue;
        }

        try {
          const account = randomPredictor(pool);
          const auctionPayload = await generateAuctionPayload(account);
          liveStats.auctions.started++;

          const response = (await wsPool.sendAndWait(conn, {
            type: 'auction.start',
            payload: auctionPayload,
          })) as { payload?: { auctionId?: string; error?: string } };

          if (response.payload?.error) {
            liveStats.auctions.errors++;
          } else if (response.payload?.auctionId) {
            liveStats.auctions.acked++;
            activeAuctions.push(response.payload.auctionId);
            // Keep list bounded
            if (activeAuctions.length > 100) activeAuctions.shift();

            // Submit a bid
            const bidConn = wsPool.random();
            if (bidConn) {
              const counterparty = randomCounterparty(pool);
              const bidPayload = await generateBidPayload(counterparty, {
                auctionId: response.payload.auctionId,
                picks: auctionPayload.picks,
                predictor: auctionPayload.predictor,
                predictorCollateral: auctionPayload.predictorCollateral,
                chainId: auctionPayload.chainId,
                escrowContract: auctionPayload.escrowContract,
              });
              liveStats.bids.sent++;
              try {
                const bidResp = (await wsPool.sendAndWait(bidConn, {
                  type: 'bid.submit',
                  payload: bidPayload,
                })) as { payload?: { error?: string } };
                if (bidResp.payload?.error) {
                  liveStats.bids.rejected++;
                } else {
                  liveStats.bids.acked++;
                }
              } catch {
                liveStats.bids.rejected++;
              }
            }
          }
        } catch {
          liveStats.auctions.errors++;
        }

        // Pace: ~2 auctions/sec at 1x
        await delay(Math.max(50, 500 / config.scale));
      }
    })()
  );

  // 30% — GraphQL queries (light)
  if (httpDriver) {
    workers.push(
      (async () => {
        const lightQueries = ['protocolStats', 'markets'] as const;
        while (Date.now() < endTime) {
          const q =
            lightQueries[Math.floor(Math.random() * lightQueries.length)];
          await httpDriver.query(GRAPHQL_QUERIES[q], q);
          await delay(Math.max(20, 200 / config.scale));
        }
      })()
    );
  }

  // 20% — WS subscribe/unsubscribe (simulates secondary market activity)
  workers.push(
    (async () => {
      while (Date.now() < endTime) {
        const conn = wsPool.random();
        if (!conn || activeAuctions.length === 0) {
          await delay(200);
          continue;
        }

        const auctionId =
          activeAuctions[Math.floor(Math.random() * activeAuctions.length)];
        wsPool.send(conn, {
          type: 'auction.subscribe',
          payload: { auctionId },
        });

        await delay(Math.max(50, 300 / config.scale));

        // Unsubscribe half the time
        if (Math.random() > 0.5) {
          wsPool.send(conn, {
            type: 'auction.unsubscribe',
            payload: { auctionId },
          });
        }
      }
    })()
  );

  // 10% — Heavy nested GraphQL queries
  if (httpDriver) {
    workers.push(
      (async () => {
        const heavyQueries = ['conditions', 'profitLeaderboard'] as const;
        while (Date.now() < endTime) {
          const q =
            heavyQueries[Math.floor(Math.random() * heavyQueries.length)];
          await httpDriver.query(GRAPHQL_QUERIES[q], q);
          await delay(Math.max(100, 1000 / config.scale));
        }
      })()
    );
  }

  await Promise.allSettled(workers);

  clearInterval(progressInterval);

  // Final stats
  const ps = wsPool.poolStats;
  liveStats.connections = {
    active: ps.active,
    failed: ps.failed,
    rateLimited: ps.rateLimited,
  };
  liveStats.msgsSent = ps.msgsSent + (httpDriver?.driverStats.total ?? 0);
  liveStats.msgsRecv = ps.msgsRecv + (httpDriver?.driverStats.success ?? 0);
  liveStats.elapsed = (Date.now() - startTime) / 1000;

  if (httpDriver) {
    const ds = httpDriver.driverStats;
    console.log(
      `\nHTTP: total=${ds.total} ok=${ds.success} 429=${ds.status429} 503=${ds.status503} err=${ds.otherErrors}`
    );
  }

  printFinalReport(liveStats, metrics);

  console.log('Shutting down...');
  await wsPool.shutdown();
  console.log('Done.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
