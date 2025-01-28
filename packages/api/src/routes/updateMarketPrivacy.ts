import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import dataSource from '../db';
import { Market } from '../models/Market';

const router = Router();
const marketRepository = dataSource.getRepository(Market);

router.post(
  '/',
  handleAsyncErrors(async (req, res) => {
    const { address, chainId, signature, timestamp } = req.body;

    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const market = await marketRepository.findOne({
      where: {
        chainId: Number(chainId),
        address: address,
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
