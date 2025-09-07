import { router as marketRoutes } from './markets';
import { router as reindexRoutes } from './reindex';
import { router as refreshCacheRoutes } from './refreshCache';
import { router as quoterRoutes } from './quoter';
import { router as createMarketRoutes } from './createMarket';
import { Router } from 'express';
import { adminAuth } from '../middleware';

const router = Router();
const adminRouter = Router();

// Apply admin authentication to all admin routes
adminRouter.use(adminAuth);

router.use('/quoter', quoterRoutes);

adminRouter.use('/marketGroups', marketRoutes);
adminRouter.use('/reindex', reindexRoutes);
adminRouter.use('/cache', refreshCacheRoutes);
adminRouter.use('/marketGroups', createMarketRoutes);

router.use('/admin', adminRouter);

export { router };
