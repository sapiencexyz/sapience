import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { isValidWalletSignature } from '../middleware';
import dataSource from '../db';
import { Market } from '../models/Market';
import { Epoch } from '../models/Epoch';

const router = Router();
const marketRepository = dataSource.getRepository(Market);
const epochRepository = dataSource.getRepository(Epoch);

router.post(
  '/',
  handleAsyncErrors(async (req, res) => {
    const { address, chainId, epochId, signature, timestamp } = req.body;

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
      relations: ['epochs'],
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const epoch = await epochRepository.findOne({
      where: {
        market: { id: market.id },
        epochId: Number(epochId),
      },
    });

    if (!epoch) {
      res.status(404).json({ error: 'Epoch not found' });
      return;
    }

    epoch.public = !epoch.public;
    await epochRepository.save(epoch);

    res.json({ success: true });
  })
);

export { router };
