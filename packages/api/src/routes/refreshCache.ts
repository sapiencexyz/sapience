import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { ResourcePerformanceManager } from 'src/performance/resourcePerformanceManager';
import { resourceRepository } from 'src/db';

const router = Router();

router.get(
  '/refresh',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { signature, signatureTimestamp, hardInitialize } = req.query as {
      signature: string;
      signatureTimestamp: string;
      hardInitialize: string;
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

    // For local development
    try {
      console.log('Starting Cache Refresh');
      const resources = await resourceRepository.find();
      const resourcePerformanceManager =
        ResourcePerformanceManager.getInstance();
      if (hardInitialize && hardInitialize.toLowerCase() === 'true') {
        await resourcePerformanceManager.hardRefresh(resources);
      } else {
        await resourcePerformanceManager.softRefresh(resources);
      }
      console.log('Cache Refresh Completed');
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
