import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';
import { createRenderJob, fetchRenderServices } from '../utils/utils';
import { config } from '../config';

const router = Router();

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

    const startCommand =
      `pnpm run start:reindex-accuracy ${address || ''} ${marketId || ''}`.trim();

    if (config.isProd) {
      const renderServices = await fetchRenderServices();
      const worker = renderServices.find(
        (item: {
          service?: {
            type?: string;
            name?: string;
            branch?: string;
            id?: string;
          };
        }) =>
          item?.service?.type === 'background_worker' &&
          item?.service?.name?.startsWith('background-worker') &&
          item?.service?.branch === 'main'
      );

      if (!worker?.service?.id) {
        throw new Error('Background worker not found');
      }

      const job = await createRenderJob(worker.service.id, startCommand);
      await prisma.renderJob.create({
        data: { jobId: job.id, serviceId: job.serviceId },
      });
      res.json({ success: true, job });
      return;
    }

    // local development
    try {
      const result = await executeLocalReindex(startCommand);
      res.json({ success: true, job: result });
    } catch (error: unknown) {
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

    if (!chainId || isNaN(parseInt(chainId))) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }

    const startCommand = `pnpm run start:reindex-prediction-market ${chainId} ${startTimestamp || 'undefined'} ${endTimestamp || 'undefined'} ${clearExisting || false}`;

    if (config.isProd) {
      const renderServices = await fetchRenderServices();
      const worker = renderServices.find(
        (item: {
          service?: {
            type?: string;
            name?: string;
            branch?: string;
            id?: string;
          };
        }) =>
          item?.service?.type === 'background_worker' &&
          item?.service?.name?.startsWith('background-worker') &&
          item?.service?.branch === 'main'
      );

      if (!worker?.service?.id) {
        throw new Error('Background worker not found');
      }

      const job = await createRenderJob(worker.service.id, startCommand);
      await prisma.renderJob.create({
        data: { jobId: job.id, serviceId: job.serviceId },
      });
      res.json({ success: true, job });
      return;
    }

    // local development
    try {
      const result = await executeLocalReindex(startCommand);
      res.json({ success: true, job: result });
    } catch (error: unknown) {
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

    const startCommand = `pnpm run start:backfill-stats ${days || 90} ${chainId || 'undefined'}`;

    if (config.isProd) {
      const renderServices = await fetchRenderServices();
      const worker = renderServices.find(
        (item: {
          service?: {
            type?: string;
            name?: string;
            branch?: string;
            id?: string;
          };
        }) =>
          item?.service?.type === 'background_worker' &&
          item?.service?.name?.startsWith('background-worker') &&
          item?.service?.branch === 'main'
      );

      if (!worker?.service?.id) {
        throw new Error('Background worker not found');
      }

      const job = await createRenderJob(worker.service.id, startCommand);
      await prisma.renderJob.create({
        data: { jobId: job.id, serviceId: job.serviceId },
      });
      res.json({ success: true, job });
      return;
    }

    // local development
    try {
      const result = await executeLocalReindex(startCommand);
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

export { router };
