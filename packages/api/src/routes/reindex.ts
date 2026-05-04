import { Router } from 'express';
import { handleAsyncErrors } from '../services/handleAsyncErrors';
import prisma from '../core/db';
import { backfillProtocolStats } from '../services/protocolStats';

const router = Router();

router.post(
  '/protocol-stats',
  handleAsyncErrors(async (req, res) => {
    const { days, chainId, intervalSeconds } = req.body;

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
    const parsedInterval =
      intervalSeconds !== undefined ? parseInt(intervalSeconds) : undefined;
    if (
      parsedInterval !== undefined &&
      (isNaN(parsedInterval) || parsedInterval <= 0)
    ) {
      res
        .status(400)
        .json({ error: 'intervalSeconds must be a positive integer' });
      return;
    }

    const params = JSON.stringify({
      days: parsedDays,
      chainId: parsedChainId,
      intervalSeconds: parsedInterval,
    });
    const job = await prisma.backgroundJob.create({
      data: { command: 'backfill-stats', status: 'running', params },
    });

    void (async () => {
      try {
        await backfillProtocolStats(parsedChainId, parsedDays, parsedInterval);
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

export { router };
