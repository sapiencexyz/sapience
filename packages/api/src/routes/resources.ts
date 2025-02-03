import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { justifyTimeSeries } from '../helpers/timeSeriesHelpers';
import { Resource } from '../models/Resource';
import dataSource from '../db';
import { ResourcePrice } from 'src/models/ResourcePrice';

const router = Router();

const resourceRepository = dataSource.getRepository(Resource);
const resourcePriceRepository = dataSource.getRepository(ResourcePrice);

router.get(
  '/',
  handleAsyncErrors(async (req: any, res: any) => {
    const resources = await resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.markets', 'market')
      .leftJoinAndSelect('market.epochs', 'epoch')
      .getMany();

    // Format the response to include only necessary data
    const formattedResources = resources.map((resource: Resource) => ({
      id: resource.id,
      name: resource.name,
      slug: resource.slug,
      markets: (resource.markets || [])
        .filter((market: any) => market.public)
        .map((market: any) => ({
          id: market.id,
          address: market.address,
          chainId: market.chainId,
          name: resource.name,
          epochs: market.epochs.map((epoch: any) => ({
            id: epoch.id,
            epochId: epoch.epochId,
            startTimestamp: Number(epoch.startTimestamp),
            endTimestamp: Number(epoch.endTimestamp),
            settled: epoch.settled,
          })),
        })),
    }));

    res.json(formattedResources);
  })
);

router.get(
  '/:slug/prices/latest',
  handleAsyncErrors(async (req, res) => {
    const { slug } = req.params;

    const resource = await resourceRepository.findOne({ where: { slug } });

    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const latestPrice = await resourcePriceRepository.findOne({
      where: { resource: { id: resource.id } },
      order: { timestamp: 'DESC' },
      relations: ['resource'],
    });

    if (!latestPrice) {
      res.status(404).json({ error: 'No price data found' });
      return;
    }

    res.json(latestPrice);
  })
);

router.get(
  '/:slug/prices',
  handleAsyncErrors(async (req, res) => {
    const { slug } = req.params;
    const { startTime, endTime } = req.query;

    const resource = await resourceRepository.findOne({ where: { slug } });

    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const query = resourcePriceRepository
      .createQueryBuilder('price')
      .where('price.resourceId = :resourceId', { resourceId: resource.id })
      .orderBy('price.timestamp', 'ASC');

    if (startTime) {
      query.andWhere('price.timestamp >= :startTime', { startTime });
    }
    if (endTime) {
      query.andWhere('price.timestamp <= :endTime', { endTime });
    }

    const prices = await query.getMany();

    // Convert timestamps to numbers and justify the time series
    const formattedPrices = prices.map(price => ({
      ...price,
      timestamp: Number(price.timestamp),
      value: price.value
    }));

    const justifiedPrices = justifyTimeSeries(formattedPrices, (item) => Number(item.value));

    res.json(justifiedPrices);
  })
);

export { router };
