import { router as marketRoutes } from './markets';

import { Router } from 'express';

const router = Router();

router.use('/markets', marketRoutes);

export default router;
