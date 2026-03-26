import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';
import {
  getResolverAddressesForChain,
  getLegacyResolverAddressesForChain,
} from '@sapience/sdk/contracts';
import { getProviderForChain } from '../utils/utils';
import { reindexAccuracy } from '../workers/jobs/reindexAccuracy';
import { reindexConditionSettled } from '../workers/jobs/reindexConditionSettled';
import { backfillProtocolStats } from '../helpers/protocolStats';
import { reindexTransfers } from '../workers/jobs/reindexTransfers';
import { reindexCollateralTransfers } from '../workers/jobs/reindexCollateralTransfers';

const router = Router();

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SAFE_STRING_RE = /^[a-zA-Z0-9_\-.:x]+$/;

router.post(
  '/accuracy',
  handleAsyncErrors(async (req, res) => {
    const { address, marketId } = req.body;

    if (address && !ETH_ADDRESS_RE.test(address)) {
      res.status(400).json({ error: 'Invalid address format' });
      return;
    }
    if (marketId && !SAFE_STRING_RE.test(String(marketId))) {
      res.status(400).json({ error: 'Invalid marketId format' });
      return;
    }

    const params = JSON.stringify({ address, marketId });
    const job = await prisma.backgroundJob.create({
      data: { command: 'reindex-accuracy', status: 'running', params },
    });

    void (async () => {
      try {
        await reindexAccuracy(address || undefined, marketId || undefined);
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: 'completed' },
        });
        console.log(`[reindex/accuracy] Job ${job.id} completed`);
      } catch (error) {
        console.error(
          `[reindex/accuracy] Job ${job.id} failed:`,
          error instanceof Error ? error.message : error
        );
        await prisma.backgroundJob
          .update({ where: { id: job.id }, data: { status: 'failed' } })
          .catch(() => {});
      }
    })();

    res.status(202).json({ success: true, jobId: job.id });
  })
);

router.post(
  '/condition-settled',
  handleAsyncErrors(async (req, res) => {
    const { chainId, startTimestamp, endTimestamp, legacy } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    if (
      startTimestamp !== undefined &&
      startTimestamp !== 'undefined' &&
      isNaN(parseInt(startTimestamp))
    ) {
      res.status(400).json({ error: 'startTimestamp must be a number' });
      return;
    }
    if (
      endTimestamp !== undefined &&
      endTimestamp !== 'undefined' &&
      isNaN(parseInt(endTimestamp))
    ) {
      res.status(400).json({ error: 'endTimestamp must be a number' });
      return;
    }

    const includeLegacy = legacy === true || legacy === 'true';

    const resolverAddresses = getResolverAddressesForChain(parsedChainId).map(
      (r) => r.address
    );
    const legacyResolverAddresses = includeLegacy
      ? getLegacyResolverAddressesForChain(parsedChainId).map((r) => r.address)
      : [];

    const allAddresses = [...resolverAddresses, ...legacyResolverAddresses];
    if (allAddresses.length === 0) {
      res.status(400).json({
        error: `No resolver addresses configured for chain ${parsedChainId}`,
      });
      return;
    }

    const parsedStart = startTimestamp ? parseInt(startTimestamp) : undefined;
    const parsedEnd = endTimestamp ? parseInt(endTimestamp) : undefined;

    const params = JSON.stringify({
      chainId: parsedChainId,
      resolverAddresses: allAddresses,
      startTimestamp: parsedStart,
      endTimestamp: parsedEnd,
      legacy: includeLegacy,
    });

    const job = await prisma.backgroundJob.create({
      data: { command: 'reindex-condition-settled', status: 'running', params },
    });

    void (async () => {
      try {
        const legacySet = new Set(legacyResolverAddresses);
        for (const resolverAddress of allAddresses) {
          await reindexConditionSettled(
            parsedChainId,
            resolverAddress,
            parsedStart,
            parsedEnd,
            legacySet.has(resolverAddress)
          );
        }
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: 'completed' },
        });
        console.log(`[reindex/condition-settled] Job ${job.id} completed`);
      } catch (error) {
        console.error(
          `[reindex/condition-settled] Job ${job.id} failed:`,
          error instanceof Error ? error.message : error
        );
        await prisma.backgroundJob
          .update({ where: { id: job.id }, data: { status: 'failed' } })
          .catch(() => {});
      }
    })();

    res.status(202).json({ success: true, jobId: job.id });
  })
);

router.post(
  '/protocol-stats',
  handleAsyncErrors(async (req, res) => {
    const { days, chainId } = req.body;

    const parsedDays = days !== undefined ? parseInt(days) : 90;
    if (isNaN(parsedDays) || parsedDays <= 0) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    const parsedChainId = chainId ? parseInt(chainId) : undefined;
    if (parsedChainId !== undefined && isNaN(parsedChainId)) {
      res.status(400).json({ error: 'chainId must be a number' });
      return;
    }

    const params = JSON.stringify({ days: parsedDays, chainId: parsedChainId });
    const job = await prisma.backgroundJob.create({
      data: { command: 'backfill-stats', status: 'running', params },
    });

    void (async () => {
      try {
        await backfillProtocolStats(parsedChainId, parsedDays);
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: 'completed' },
        });
        console.log(`[reindex/protocol-stats] Job ${job.id} completed`);
      } catch (error) {
        console.error(
          `[reindex/protocol-stats] Job ${job.id} failed:`,
          error instanceof Error ? error.message : error
        );
        await prisma.backgroundJob
          .update({ where: { id: job.id }, data: { status: 'failed' } })
          .catch(() => {});
      }
    })();

    res.status(202).json({ success: true, jobId: job.id });
  })
);

router.post(
  '/position-balances',
  handleAsyncErrors(async (req, res) => {
    const { chainId, fromBlock, days } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    if (fromBlock !== undefined && isNaN(parseInt(fromBlock))) {
      res.status(400).json({ error: 'fromBlock must be a number' });
      return;
    }
    if (days !== undefined && (isNaN(parseInt(days)) || parseInt(days) <= 0)) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }

    // Resolve fromBlock: explicit fromBlock > days-based binary search > omit (let job decide)
    let resolvedFromBlock: number | undefined = fromBlock
      ? parseInt(fromBlock)
      : undefined;

    if (!resolvedFromBlock && days) {
      const client = getProviderForChain(parsedChainId);
      const targetTimestamp = BigInt(
        Math.floor(Date.now() / 1000) - parseInt(days) * 86400
      );
      const currentBlock = await client.getBlockNumber();

      // Binary search for the block closest to targetTimestamp
      let lo = 0n;
      let hi = currentBlock;
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        const block = await client.getBlock({ blockNumber: mid });
        if (block.timestamp < targetTimestamp) {
          lo = mid + 1n;
        } else {
          hi = mid;
        }
      }
      resolvedFromBlock = Number(lo);
      console.log(
        `[reindex/position-balances] Resolved ${days} days ago to block ${resolvedFromBlock}`
      );
    }

    const params = JSON.stringify({
      chainId: parsedChainId,
      fromBlock: resolvedFromBlock,
      days: days ? parseInt(days) : undefined,
    });

    const job = await prisma.backgroundJob.create({
      data: { command: 'reindex-transfers', status: 'running', params },
    });

    void (async () => {
      try {
        const result = await reindexTransfers(parsedChainId, resolvedFromBlock);
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: result ? 'completed' : 'failed' },
        });
        console.log(
          `[reindex/position-balances] Job ${job.id} ${result ? 'completed' : 'failed'}`
        );
      } catch (error) {
        console.error(
          `[reindex/position-balances] Job ${job.id} failed:`,
          error instanceof Error ? error.message : error
        );
        await prisma.backgroundJob
          .update({ where: { id: job.id }, data: { status: 'failed' } })
          .catch(() => {});
      }
    })();

    res.status(202).json({ success: true, jobId: job.id });
  })
);

router.post(
  '/collateral-transfers',
  handleAsyncErrors(async (req, res) => {
    const { chainId, fromBlock } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    const parsedFromBlock =
      fromBlock !== undefined ? parseInt(fromBlock) : undefined;
    if (parsedFromBlock !== undefined && isNaN(parsedFromBlock)) {
      res.status(400).json({ error: 'fromBlock must be a number' });
      return;
    }

    const params = JSON.stringify({
      chainId: parsedChainId,
      fromBlock: parsedFromBlock,
    });

    const job = await prisma.backgroundJob.create({
      data: {
        command: 'reindex-collateral-transfers',
        status: 'running',
        params,
      },
    });

    void (async () => {
      try {
        const result = await reindexCollateralTransfers(
          parsedChainId,
          parsedFromBlock
        );
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: { status: result ? 'completed' : 'failed' },
        });
        console.log(
          `[reindex/collateral-transfers] Job ${job.id} ${result ? 'completed' : 'failed'}`
        );
      } catch (error) {
        console.error(
          `[reindex/collateral-transfers] Job ${job.id} failed:`,
          error instanceof Error ? error.message : error
        );
        await prisma.backgroundJob
          .update({ where: { id: job.id }, data: { status: 'failed' } })
          .catch(() => {});
      }
    })();

    res.status(202).json({ success: true, jobId: job.id });
  })
);

export { router };
