import { router as reindexRoutes } from './reindex';
import { Router } from 'express';
import { adminAuth } from '../middleware';
import { router as conditionsRoutes } from './conditions';
import { router as conditionGroupsRoutes } from './conditionGroups';
import { router as referralsRoutes } from './referrals';

const router = Router();
const adminRouter = Router();

// Apply admin authentication to all admin routes
adminRouter.use(adminAuth);

router.use('/referrals', referralsRoutes);

adminRouter.use('/reindex', reindexRoutes);
adminRouter.use('/conditions', conditionsRoutes);
adminRouter.use('/conditionGroups', conditionGroupsRoutes);

router.use('/admin', adminRouter);

export { router };
