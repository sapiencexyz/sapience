import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { CandleCacheProcessManager } from 'src/candle-cache/candleCacheProcessManager';
import { CandleCacheStatusManager } from 'src/candle-cache/candleCacheStatusManager';

const router = Router();

router.get(
  '/refresh-candle-cache',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { signature, signatureTimestamp } = req.query as {
      signature: string;
      signatureTimestamp: string;
    };
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
    }

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
    const { signature, signatureTimestamp } = req.query as {
      signature: string;
      signatureTimestamp: string;
    };
    const resourceSlug = req.params.resourceSlug.toLowerCase();
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
    }

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