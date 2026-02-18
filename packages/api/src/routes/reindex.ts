import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';

const router = Router();

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SAFE_STRING_RE = /^[a-zA-Z0-9_\-.:x]+$/;

const executeLocalReindex = async (
  startCommand: string
): Promise<{ id: string; status: string; output: string }> => {
  return new Promise((resolve, reject) => {
    // Use dynamic import for child_process
    import('child_process')
      .then(({ spawn }) => {
        const [command, ...args] = startCommand.split(' ');

        const process = spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let output = '';

        process.stdout.on('data', (data: Buffer) => {
          const str = data.toString();
          output += str;
          console.log(str); // Stream to console in real-time
        });

        process.stderr.on('data', (data: Buffer) => {
          const str = data.toString();
          console.error(str); // Stream to console in real-time
          output += `Error: ${str}\n`; // Also capture errors in the output
        });

        process.on('close', (code: number) => {
          if (code === 0) {
            resolve({ id: 'local', status: 'completed', output });
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      })
      .catch(() => {
        reject(new Error('Failed to load child_process module'));
      });
  });
};

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

    const startCommand =
      `pnpm run start:reindex-accuracy ${address || ''} ${marketId || ''}`.trim();

    const params = JSON.stringify({ address, marketId });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: { command: 'reindex-accuracy', status: result.status, params },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: { command: 'reindex-accuracy', status: 'failed', params },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.post(
  '/prediction-market',
  handleAsyncErrors(async (req, res) => {
    const { chainId, startTimestamp, endTimestamp, clearExisting } = req.body;

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

    const startCommand = `pnpm run start:reindex-prediction-market ${parsedChainId} ${startTimestamp || 'undefined'} ${endTimestamp || 'undefined'} ${clearExisting === true || clearExisting === 'true'}`;

    const params = JSON.stringify({
      chainId: parsedChainId,
      startTimestamp,
      endTimestamp,
      clearExisting,
    });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-prediction-market',
          status: result.status,
          params,
        },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-prediction-market',
          status: 'failed',
          params,
        },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
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
    if (
      chainId !== undefined &&
      chainId !== 'undefined' &&
      isNaN(parseInt(chainId))
    ) {
      res.status(400).json({ error: 'chainId must be a number' });
      return;
    }

    const startCommand = `pnpm run start:backfill-stats ${parsedDays} ${chainId || 'undefined'}`;

    const params = JSON.stringify({ days: parsedDays, chainId });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: { command: 'backfill-stats', status: result.status, params },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: { command: 'backfill-stats', status: 'failed', params },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

export { router };
