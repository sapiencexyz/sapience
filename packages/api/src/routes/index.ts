import { router as marketRoutes } from './markets';
import { router as reindexRoutes } from './reindex';
import { router as refreshCacheRoutes } from './refreshCache';
import { router as quoterRoutes } from './quoter';
import { router as createMarketRoutes } from './createMarket';
import { Router } from 'express';

const router = Router();
const adminRouter = Router();

router.use('/quoter', quoterRoutes);

adminRouter.use('/marketGroups', marketRoutes);
adminRouter.use('/reindex', reindexRoutes);
adminRouter.use('/cache', refreshCacheRoutes);
adminRouter.use('/create-market-group', createMarketRoutes);

router.use('/admin', adminRouter);

export { router };
