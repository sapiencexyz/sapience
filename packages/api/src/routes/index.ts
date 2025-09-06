import { router as marketRoutes } from './markets';
import { router as reindexRoutes } from './reindex';
import { router as refreshCacheRoutes } from './refreshCache';
import { router as quoterRoutes } from './quoter';
import { router as createMarketRoutes } from './createMarket';
import { Router } from 'express';

const router = Router();

router.use('/marketGroups', marketRoutes);
router.use('/reindex', reindexRoutes);
router.use('/cache', refreshCacheRoutes);
router.use('/quoter', quoterRoutes);
router.use('/create-market-group', createMarketRoutes);

export { router };
