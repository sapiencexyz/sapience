import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import { ResourcePerformanceManager } from 'src/performance/resourcePerformanceManager';
import { resourceRepository } from 'src/db';

const router = Router();

router.get(
  '/refresh',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { signature, signatureTimestamp, hardInitialize, resource } =
      req.query as {
        signature: string;
        signatureTimestamp: string;
        hardInitialize: string;
        resource: string;
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

    const resourceManager = ResourcePerformanceManager.getInstance();

    if (hardInitialize === 'true') {
      try {
        if (resource) {
          // find the specific resource by slug
          const resourceData = await resourceRepository.findOne({
            where: { slug: resource },
          });

          if (!resourceData) {
            res.status(404).json({ error: `Resource '${resource}' not found` });
            return;
          }

          // hard refresh the specific resource
          await resourceManager.hardRefresh([resourceData]);

          res.json({
            success: true,
            message: `Resource '${resource}' cache refreshed with hard initialization`,
          });
        }
      } catch (error) {
        console.error('Error during hard refresh:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to refresh cache with hard initialization',
        });
      }
    }
    // if hardInitialize is false we soft initalize
    else {
      try {
        if (resource) {
          const resourceData = await resourceRepository.findOne({
            where: { slug: resource },
          });

          if (!resourceData) {
            res.status(404).json({ error: `Resource '${resource}' not found` });
            return;
          }

          // soft refresh the specific resource
          await resourceManager.softRefresh([resourceData]);

          res.json({
            success: true,
            message: `Resource '${resource}' cache refreshed`,
          });
        }
      } catch (error) {
        console.error('Error during soft refresh:', error);
        res.status(500).json({
          error:
            error instanceof Error ? error.message : 'Failed to refresh cache',
        });
      }
    }
  })
);

export { router };
