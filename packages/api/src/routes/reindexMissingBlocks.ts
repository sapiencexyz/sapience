import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { RenderJob } from '../models/RenderJob';
import { renderJobRepository } from '../db';

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
          output += data;
        });

        process.stderr.on('data', (data: Buffer) => {
          console.error(`Error: ${data}`);
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
  '/',
  handleAsyncErrors(async (req: any, res: any) => {
    const { chainId, address, epochId, signature, timestamp, model } =
      req.body;

    // Authenticate the user
    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const RENDER_API_KEY = process.env.RENDER_API_KEY;
    if (!RENDER_API_KEY) {
      throw new Error('RENDER_API_KEY not set');
    }

    async function fetchRenderServices() {
      const url = 'https://api.render.com/v1/services?limit=100';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${RENDER_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    }

    async function createRenderJob(serviceId: string, startCommand: string) {
      const url = `https://api.render.com/v1/services/${serviceId}/jobs`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startCommand: startCommand,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    }

    let id: string = '';
    const renderServices = await fetchRenderServices();
    for (const item of renderServices) {
      if (
        item?.service?.type === 'background_worker' &&
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

    const startCommand =
      model === 'ResourcePrice'
        ? `pnpm run start:reindex-missing ${chainId} ${address} ${epochId}`
        : `pnpm run start:reindex-market ${chainId} ${address} ${epochId}`;

    if (process.env.NODE_ENV !== 'production') {
      try {
        const result = await executeLocalReindex(startCommand);
        res.json({ success: true, job: result });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
      return;
    }

    const job = await createRenderJob(id, startCommand);

    const jobDb = new RenderJob();
    jobDb.jobId = job.id;
    jobDb.serviceId = job.serviceId;
    await renderJobRepository.save(jobDb);

    res.json({ success: true, job });
  })
);

export { router };
