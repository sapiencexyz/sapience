import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { justifyTimeSeries } from '../helpers/timeSeriesHelpers';
import { Resource } from '../models/Resource';
import dataSource from '../db';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { groupResourcePricesByTimeWindow } from 'src/serviceUtil';
import { TimeWindow } from 'src/interfaces';

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
  handleAsyncErrors(async (req: any, res: any) => {
    const { slug } = req.params;
    const { startTime, endTime, timeWindow } = req.query;

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

    // First justify the time series
    const justifiedPrices = justifyTimeSeries(
      prices.map(price => ({
        timestamp: Number(price.timestamp),
        value: Number(price.value),
      })),
      (item) => Number(item.value)
    );

    // Group the justified prices by time window if timeWindow is provided
    if (timeWindow) {
      const groupedPrices = groupResourcePricesByTimeWindow(
        justifiedPrices.map(price => ({
          ...prices[0],
          timestamp: price.timestamp,
          value: String(price.value),
        })),
        timeWindow as TimeWindow
      );

      const priceData = groupedPrices.map(group => {
        const prices = group.entities;
        if (prices.length === 0) return null;

        return {
          timestamp: Number(prices[prices.length - 1].timestamp),
          value: String(prices[prices.length - 1].value),
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      res.json(priceData);
      return;
    }

    // If no timeWindow, return justified prices directly
    const formattedPrices = justifiedPrices.map(price => ({
      timestamp: price.timestamp,
      value: String(price.value)
    }));

    res.json(formattedPrices);
  })
);

export { router };
