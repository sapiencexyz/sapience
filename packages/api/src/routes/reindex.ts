import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { RenderJob } from '../models/RenderJob';
import { renderJobRepository } from '../db';
import { createRenderJob, fetchRenderServices } from 'src/utils/utils';
import { Request, Response } from 'express';

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
  '/resource',
  handleAsyncErrors(async (req, res) => {
    const {
      signature,
      signatureTimestamp,
      startTimestamp,
      endTimestamp,
      slug,
    } = req.body;
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'staging';

    // For production/staging environments
    if (isProduction) {
      // Verify signature
      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(signatureTimestamp)
      );
      if (!isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get background worker service ID
      const renderServices = await fetchRenderServices();
      const worker = renderServices.find(
        (item: {
          service?: {
            type: string;
            id?: string;
            branch?: string;
            name?: string;
          };
        }) =>
          item?.service?.type === 'background_worker' &&
          item?.service?.name?.startsWith('background-worker') &&
          item?.service?.branch ===
            (process.env.NODE_ENV === 'staging' ? 'staging' : 'main')
      );

      if (!worker?.service?.id) {
        throw new Error('Background worker not found');
      }

      // Create and save render job
      const startCommand = `pnpm run start:reindex-resource ${slug} ${startTimestamp} ${endTimestamp}`;
      const job = await createRenderJob(worker.service.id, startCommand);

      const jobDb = new RenderJob();
      jobDb.jobId = job.id;
      jobDb.serviceId = job.serviceId;
      await renderJobRepository.save(jobDb);

      res.json({ success: true, job });
      return;
    }

    // For local development
    try {
      const startCommand = `pnpm run start:reindex-resource ${slug} ${startTimestamp} ${endTimestamp}`;
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

// Helper function to handle reindexing logic for both endpoints
const handleReindexRequest = async (
  req: Request,
  res: Response,
  isResourcePrice: boolean
) => {
  const { chainId, address, marketId, signature, timestamp } = req.body;

  const startCommand = isResourcePrice
    ? `pnpm run start:reindex-missing ${chainId} ${address} ${marketId}`
    : `pnpm run start:reindex-market ${chainId} ${address} ${marketId}`;

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  if (isProduction) {
    // Authenticate the user
    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let id: string = '';
    const renderServices = await fetchRenderServices();
    for (const item of renderServices) {
      if (
        item?.service?.type === 'background_worker' &&
        item?.service?.name?.startsWith('background-worker') &&
        item?.service?.id &&
        (process.env.NODE_ENV === 'staging'
          ? item?.service?.branch === 'staging'
          : item?.service?.branch === 'main')
      ) {
        id = item?.service.id;
        break;
      }
    }
    if (!id) {
      throw new Error('Background worker not found');
    }

    const job = await createRenderJob(id, startCommand);

    const jobDb = new RenderJob();
    jobDb.jobId = job.id;
    jobDb.serviceId = job.serviceId;
    await renderJobRepository.save(jobDb);

    res.json({
      success: true,
      message: `Reindexing ${isResourcePrice ? 'missing prices' : 'market events'} started`,
      job,
    });
    return;
  }

  // local development
  try {
    const result = await executeLocalReindex(startCommand);
    res.json({
      success: true,
      message: `Reindexing ${isResourcePrice ? 'missing prices' : 'market events'} completed`,
      job: result,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An unknown error occurred' });
    }
  }
};

// New endpoint for missing prices reindexing
router.post(
  '/missing-prices',
  handleAsyncErrors(async (req, res) => {
    await handleReindexRequest(req, res, true);
  })
);

// New endpoint for market events reindexing
router.post(
  '/market-events',
  handleAsyncErrors(async (req, res) => {
    await handleReindexRequest(req, res, false);
  })
);

// New endpoint for market group factory reindexing
router.post(
  '/market-group-factory',
  handleAsyncErrors(async (req, res) => {
    const { chainId, factoryAddress, signature, timestamp } = req.body;

    const startCommand = `pnpm run start:reindex-market-group-factory ${chainId} ${factoryAddress}`;

    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'staging';

    if (isProduction) {
      // Authenticate the user
      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(timestamp)
      );
      if (!isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      let id: string = '';
      const renderServices = await fetchRenderServices();
      for (const item of renderServices) {
        if (
          item?.service?.type === 'background_worker' &&
          item?.service?.name?.startsWith('background-worker') &&
          item?.service?.id &&
          (process.env.NODE_ENV === 'staging'
            ? item?.service?.branch === 'staging'
            : item?.service?.branch === 'main')
        ) {
          id = item?.service.id;
          break;
        }
      }
      if (!id) {
        throw new Error('Background worker not found');
      }

      const job = await createRenderJob(id, startCommand);

      const jobDb = new RenderJob();
      jobDb.jobId = job.id;
      jobDb.serviceId = job.serviceId;
      await renderJobRepository.save(jobDb);

      res.json({
        success: true,
        message: 'Reindexing market group factory started',
        job,
      });
      return;
    }

    // local development
    try {
      const result = await executeLocalReindex(startCommand);
      res.json({
        success: true,
        message: 'Reindexing market group factory completed',
        job: result,
      });
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
