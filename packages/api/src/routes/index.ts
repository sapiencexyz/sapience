import { router as marketRoutes } from './markets';
import { router as reindexRoutes } from './reindex';
import { router as permitRoutes } from './permit';
import { router as refreshCacheRoutes } from './refreshCache';
import { router as quoterRoutes } from './quoter';
import { router as createMarketRoutes } from './createMarket';
// Chat auth routes disabled in simplified chat mode
import { Router } from 'express';

const router = Router();

router.use('/marketGroups', marketRoutes);
router.use('/reindex', reindexRoutes);
router.use('/permit', permitRoutes);
router.use('/cache', refreshCacheRoutes);
router.use('/quoter', quoterRoutes);
router.use('/create-market-group', createMarketRoutes);

export { router };
