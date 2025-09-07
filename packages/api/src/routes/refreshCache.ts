import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { CandleCacheProcessManager } from 'src/candle-cache/candleCacheProcessManager';
import { CandleCacheStatusManager } from 'src/candle-cache/candleCacheStatusManager';

const router = Router();

router.get(
  '/refresh-candle-cache',
  handleAsyncErrors(async (_req: Request, res: Response) => {
    try {
      console.log('Starting Candle Cache Refresh');

      const processManager = CandleCacheProcessManager.getInstance();
      const result = await processManager.startRebuildAllCandles();

      if (result.success) {
        console.log('Candle Cache Refresh Process Started');
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.get(
  '/refresh-candle-cache/:resourceSlug',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const resourceSlug = req.params.resourceSlug.toLowerCase();

    try {
      console.log(`Starting Candle Cache Refresh for ${resourceSlug}`);

      const processManager = CandleCacheProcessManager.getInstance();
      const result =
        await processManager.startRebuildResourceCandles(resourceSlug);

      if (result.success) {
        console.log(`Candle Cache Refresh Process Started for ${resourceSlug}`);
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.get(
  '/candle-cache-status',
  handleAsyncErrors(async (req: Request, res: Response) => {
    try {
      const statusManager = CandleCacheStatusManager.getInstance();
      const status = await statusManager.getCandleCacheReBuilderStatus();
      res.json(status);
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.get(
  '/candle-cache-status/all',
  handleAsyncErrors(async (req: Request, res: Response) => {
    try {
      const statusManager = CandleCacheStatusManager.getInstance();
      const allStatus = await statusManager.getAllBuildersStatus();
      res.json(allStatus);
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.get(
  '/candle-cache-status/builder',
  handleAsyncErrors(async (req: Request, res: Response) => {
    try {
      const statusManager = CandleCacheStatusManager.getInstance();
      const status = await statusManager.getCandleCacheBuilderStatus();
      res.json(status);
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.get(
  '/candle-cache-status/rebuilder',
  handleAsyncErrors(async (req: Request, res: Response) => {
    try {
      const statusManager = CandleCacheStatusManager.getInstance();
      const status = await statusManager.getCandleCacheReBuilderStatus();
      res.json(status);
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
