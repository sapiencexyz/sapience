import { router as marketRoutes } from './markets';
import { router as resourceRoutes } from './resources';
import { router as accountRoutes } from './accounts';
import { router as estimateRoutes } from './estimate';
import { router as getStEthPerTokenAtTimestampsRoutes } from './getStEthPerTokenAtTimestamp';
import { router as leaderboardRoutes } from './leaderboard';
import { router as missingBlocksRoutes } from './missing-blocks';
import { router as positionRoutes } from './positions';
import { router as priceRoutes } from './prices';
import { router as reindexMissingBlocksRoutes } from './reindexMissingBlocks';
import { router as reindexStatusRoutes } from './reindexStatus';
import { router as updateMarketPrivacyRoutes } from './updateMarketPrivacy';
import { router as volumeRoutes } from './volume';
import { router as transactionRoutes } from './transactions';
import { router as permitRoutes } from './permit';
import { Router } from 'express';

const router = Router();

router.use('/accounts', accountRoutes);
router.use('/estimate', estimateRoutes);
router.use('/getStEthPerTokenAtTimestamps', getStEthPerTokenAtTimestampsRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/markets', marketRoutes);
router.use('/missing-blocks', missingBlocksRoutes);
router.use('/positions', positionRoutes);
router.use('/prices', priceRoutes);
router.use('/reindexMissingBlocks', reindexMissingBlocksRoutes);
router.use('/reindexStatus', reindexStatusRoutes);
router.use('/resources', resourceRoutes);
router.use('/transactions', transactionRoutes);
router.use('/updateMarketPrivacy', updateMarketPrivacyRoutes);
router.use('/volume', volumeRoutes);
router.use('/permit', permitRoutes);

export { router };
