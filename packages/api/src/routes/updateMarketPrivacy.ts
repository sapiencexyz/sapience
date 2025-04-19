import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import dataSource from '../db';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';

const router = Router();
const marketGroupRepository = dataSource.getRepository(MarketGroup);
const marketRepository = dataSource.getRepository(Market);

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

    const marketGroup = await marketGroupRepository.findOne({
      where: {
        chainId: Number(chainId),
        address: address,
      },
      relations: ['markets'],
    });

    if (!marketGroup) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const market = await marketRepository.findOne({
      where: {
        marketGroup: { id: marketGroup.id },
        marketId: Number(marketId),
      },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    market.public = !market.public;
    await marketRepository.save(market);

    res.json({ success: true });
  })
);

export { router };
