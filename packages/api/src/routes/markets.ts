import { Response, Router } from 'express';
import { Market } from '../models/Market';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import dataSource from '../db';
import { Epoch } from '../models/Epoch';

const router = Router();

const marketRepository = dataSource.getRepository(Market);

router.get(
  '/',
  handleAsyncErrors(async (_, res: Response) => {
    const markets = await marketRepository.find({
      relations: ['epochs', 'resource'],
    });

    const formattedMarkets = markets.map((market: Market) => ({
      ...market,
      epochs: market.epochs.map((epoch: Epoch) => ({
        ...epoch,
        startTimestamp: Number(epoch.startTimestamp),
        endTimestamp: Number(epoch.endTimestamp),
      })),
    }));

    res.json(formattedMarkets);
  })
);

export { router };
