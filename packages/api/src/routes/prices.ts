import { Request, Response, Router } from 'express';
import { TimeWindow } from '../interfaces';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import { validateRequestParams } from '../helpers/validateRequestParams';
import {
  getIndexPricesInTimeRange,
  getMarketPricesInTimeRange,
  getStartTimestampFromTimeWindow,
  groupIndexPricesByTimeWindow,
  groupMarketPricesByTimeWindow,
} from 'src/serviceUtil';
import { MarketPrice } from 'src/models/MarketPrice';
import { getMarketAndEpoch } from 'src/helpers';
import dataSource, { indexPriceRepository } from 'src/db';
import { Market } from 'src/models/Market';
import { Epoch } from 'src/models/Epoch';
import { Between } from 'typeorm';

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
    const startTimestamp = getStartTimestampFromTimeWindow(timeWindow);

    const marketPrices = await getMarketPricesInTimeRange(
      startTimestamp,
      endTimestamp,
      chainId,
      address,
      epochId
    );

    const groupedPrices = groupMarketPricesByTimeWindow(
      marketPrices,
      timeWindow
    );

    const chartData = groupedPrices.reduce<ChartDataPoint[]>((acc, group) => {
      const prices = group.entities;

      // updated the logic for handling empty groups. If there is not price in the group, use the last known price values
      if (prices.length === 0) {
        const lastCandle = acc[acc.length - 1];
        if (lastCandle) {
          acc.push({
            startTimestamp: group.startTimestamp,
            endTimestamp: group.endTimestamp,
            open: lastCandle.close,
            close: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
          });
        }
        return acc;
      }

      // if we have prices, calculate HLOC normally
      const open = prices[0]?.value || 0;
      const close = prices[prices.length - 1]?.value || 0;
      const high = Math.max(...prices.map((p: MarketPrice) => Number(p.value)));
      const low = Math.min(...prices.map((p: MarketPrice) => Number(p.value)));

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
  validateRequestParams(['contractId', 'epochId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    let { timeWindow } = req.query;
    const { contractId, epochId } = req.query as {
      contractId: string;
      epochId: string;
      timeWindow: TimeWindow;
    };

    if (!timeWindow) {
      timeWindow = TimeWindow.W;
    }

    const { chainId, address } = parseContractId(contractId);

    const { epoch } = await getMarketAndEpoch(
      marketRepository,
      epochRepository,
      chainId,
      address,
      epochId
    );

    const endTimestamp = Math.min(
      Number(epoch.endTimestamp),
      Math.floor(Date.now() / 1000)
    );
    const startTimestamp = Math.max(
      Number(epoch.startTimestamp),
      getStartTimestampFromTimeWindow(timeWindow as TimeWindow)
    );

    const indexPrices = await getIndexPricesInTimeRange(
      startTimestamp,
      endTimestamp,
      chainId,
      address,
      epochId
    );

    if (indexPrices.length === 0) {
      res.status(404).json({
        error: 'No price data found for the specified epoch and time window',
      });
      return;
    }

    const groupedPrices = groupIndexPricesByTimeWindow(
      indexPrices,
      timeWindow as TimeWindow
    );

    const chartData = groupedPrices.map((group) => {
      const lastIdx = group.entities.length - 1;
      const price = lastIdx >= 0 ? Number(group.entities[lastIdx].value) : 0;
      return {
        timestamp: group.startTimestamp,
        price,
      };
    });

    res.json(chartData);
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
