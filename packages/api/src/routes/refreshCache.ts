import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { CandleCacheReBuilder } from 'src/candle-cache/candleCacheReBuilder';

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

      const candleCacheReBuilder = CandleCacheReBuilder.getInstance();
      await candleCacheReBuilder.rebuildAllCandles();
      console.log('Candle Cache Refresh Completed');
      res.json({ success: true });
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
      const candleCacheReBuilder = CandleCacheReBuilder.getInstance();
      await candleCacheReBuilder.rebuildCandlesForResource(resourceSlug);
      console.log(`Candle Cache Refresh Completed for ${resourceSlug}`);
      res.json({ success: true });
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
