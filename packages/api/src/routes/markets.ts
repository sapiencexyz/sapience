import { Response, Router } from 'express';
import { MarketGroup } from '../models/MarketGroup';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import dataSource from '../db';
import { Market } from '../models/Market';

const router = Router();

const marketRepository = dataSource.getRepository(MarketGroup);

router.get(
  '/',
  handleAsyncErrors(async (_, res: Response) => {
    const markets = await marketRepository.find({
      relations: ['markets', 'resource', 'category'],
    });

    const formattedMarkets = markets.map((market: MarketGroup) => ({
      ...market,
      markets: market.markets.map((market: Market) => ({
        ...market,
        startTimestamp: Number(market.startTimestamp),
        endTimestamp: Number(market.endTimestamp),
        question: market.question,
      })),
    }));

    res.json(formattedMarkets);
  })
);

export { router };
