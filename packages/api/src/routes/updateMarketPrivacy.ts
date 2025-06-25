import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import prisma from '../db';

const router = Router();

router.post(
  '/',
  handleAsyncErrors(async (req, res) => {
    const { address, chainId, marketId, signature, timestamp } = req.body;

    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const marketGroup = await prisma.market_group.findFirst({
      where: {
        chainId: Number(chainId),
        address: address.toLowerCase(),
      },
    });

    if (!marketGroup) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const market = await prisma.market.findFirst({
      where: {
        marketGroupId: marketGroup.id,
        marketId: Number(marketId),
      },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    await prisma.market.update({
      where: {
        id: market.id,
      },
      data: {
        public: !market.public,
      },
    });

    res.json({ success: true });
  })
);

export { router };
