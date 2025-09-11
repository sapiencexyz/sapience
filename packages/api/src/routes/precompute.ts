import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { PrecomputeProcessManager } from 'src/precompute/precomputeProcessManager';
import { PrecomputeStatusManager } from 'src/precompute/precomputeStatusManager';

const router = Router();

router.get(
  '/refresh',
  handleAsyncErrors(async (_req: Request, res: Response) => {
    const processManager = PrecomputeProcessManager.getInstance();
    const result = await processManager.startPrecomputeAll();
    if (result.success) res.json({ success: true, message: result.message });
    else res.status(400).json({ success: false, error: result.message });
  })
);

router.get(
  '/status',
  handleAsyncErrors(async (_req: Request, res: Response) => {
    const statusManager = PrecomputeStatusManager.getInstance();
    const status = await statusManager.getStatus();
    res.json(status);
  })
);

export { router };
