import { Request, Response, Router } from 'express';
import { TimeWindow } from '../interfaces';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import { validateRequestParams } from '../helpers/validateRequestParams';
import { justifyTimeSeries } from '../helpers/timeSeriesHelpers';
import {
  getIndexPricesInTimeRange,
  getMarketPricesInTimeRange,
  groupIndexPricesByTimeWindow,
  groupMarketPricesByTimeWindow,
} from 'src/serviceUtil';
import { MarketPrice } from 'src/models/MarketPrice';
import { getMarketAndEpoch } from 'src/helpers';
import dataSource, { indexPriceRepository } from 'src/db';
import { Market } from 'src/models/Market';
import { Epoch } from 'src/models/Epoch';
import { Between } from 'typeorm';
import { Resource } from 'src/models/Resource';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { groupResourcePricesByTimeWindow } from 'src/serviceUtil';

interface ChartDataPoint {
  startTimestamp: number;
  endTimestamp: number;
  open: string | number;
  close: string | number;
  high: string | number;
  low: string | number;
}

const marketRepository = dataSource.getRepository(Market);
const epochRepository = dataSource.getRepository(Epoch);
const resourceRepository = dataSource.getRepository(Resource);
const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
const router = Router();

router.get(
  '/chart-data',
  validateRequestParams(['contractId', 'epochId', 'timeWindow']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { contractId, epochId, timeWindow } = req.query as {
      contractId: string;
      epochId: string;
      timeWindow: TimeWindow;
    };

    const { chainId, address } = parseContractId(contractId);

    const endTimestamp = Math.floor(Date.now() / 1000);

    const marketPrices = await getMarketPricesInTimeRange(
      0,
      endTimestamp,
      chainId,
      address,
      epochId
    );

    // First justify the raw price data to fill any gaps
    const justifiedPrices = justifyTimeSeries(
      marketPrices.map(price => ({
        ...price,
        timestamp: Number(price.timestamp),
      })),
      (item) => Number(item.value)
    ).map(price => ({
      ...price,
      timestamp: String(price.timestamp), // Convert back to string to match MarketPrice type
    })) as MarketPrice[];

    const groupedPrices = groupMarketPricesByTimeWindow(
      justifiedPrices,
      timeWindow
    );

    const chartData = groupedPrices.reduce<ChartDataPoint[]>((acc, group) => {
      const prices = group.entities;
      
      // Since we've justified the data, we should always have prices
      // But keep the safety check just in case
      if (prices.length === 0) {
        return acc;
      }

      const open = Number(prices[0].value);
      const close = Number(prices[prices.length - 1].value);
      const high = Math.max(...prices.map((p) => Number(p.value)));
      const low = Math.min(...prices.map((p) => Number(p.value)));

      acc.push({
        startTimestamp: group.startTimestamp,
        endTimestamp: group.endTimestamp,
        open,
        close,
        high,
        low,
      });

      return acc;
    }, []);

    res.json(chartData);
  })
);

router.get(
  '/index',
  validateRequestParams(['contractId', 'epochId', 'timeWindow']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { contractId, epochId, timeWindow } = req.query as {
      contractId: string;
      epochId: string;
      timeWindow: TimeWindow;
    };

    const { chainId, address } = parseContractId(contractId);

    const endTimestamp = Math.floor(Date.now() / 1000);

    const { epoch } = await getMarketAndEpoch(
      marketRepository,
      epochRepository,
      chainId,
      address,
      epochId
    );

    const indexPrices = await getIndexPricesInTimeRange(
      Number(epoch.startTimestamp),
      endTimestamp,
      chainId,
      address,
      epochId
    );

    if (indexPrices.length === 0) {
      res.status(404).json({
        error: 'No price data found for the specified epoch',
      });
      return;
    }

    // First justify the raw price data to fill any gaps
    const justifiedPrices = justifyTimeSeries(
      indexPrices.map(price => ({
        timestamp: Number(price.timestamp),
        value: Number(price.value),
      })),
      (item) => item.value
    );

    // Group the justified prices by time window
    const groupedPrices = groupIndexPricesByTimeWindow(
      justifiedPrices.map(price => ({
        ...indexPrices[0], // Keep the original IndexPrice properties
        timestamp: price.timestamp,
        value: String(price.value),
      })),
      timeWindow
    );

    // Format the response
    const priceData = groupedPrices.map(group => {
      const prices = group.entities;
      if (prices.length === 0) return null;

      // For index prices, we'll use the last price in each window
      const price = Number(prices[prices.length - 1].value);
      
      return {
        timestamp: Number(prices[prices.length - 1].timestamp),
        price
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    res.json(priceData);
  })
);

router.get(
  '/index/latest',
  validateRequestParams(['contractId', 'epochId']),
  handleAsyncErrors(async (req, res) => {
    const { contractId, epochId } = req.query as {
      contractId: string;
      epochId: string;
    };

    const { chainId, address } = parseContractId(contractId);

    const { epoch } = await getMarketAndEpoch(
      marketRepository,
      epochRepository,
      chainId,
      address,
      epochId
    );

    const latestPrice = await indexPriceRepository.findOne({
      where: {
        epoch: { id: Number(epoch.id) },
        timestamp: Between(
          Number(epoch.startTimestamp),
          Number(epoch.endTimestamp)
        ),
      },
      order: { timestamp: 'DESC' },
    });

    if (!latestPrice) {
      res.status(404).json({
        error: 'No price data found for the specified epoch',
      });
      return;
    }

    res.json({
      timestamp: Number(latestPrice.timestamp),
      price: Number(latestPrice.value),
    });
  })
);

export { router };
