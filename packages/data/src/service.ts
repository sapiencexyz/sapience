import "reflect-metadata";
import dataSource, { initializeDataSource } from "./db"; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from "cors";
import { Price } from "./entity/Price";
import { Position } from "./entity/Position";
import express from "express";
import { Between } from "typeorm";
import { Event } from "./entity/Event";

const PORT = 3001;

const startServer = async () => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);
  const eventRepository = dataSource.getRepository(Event);
  const priceRepository = dataSource.getRepository(Price);

  const app = express();
  app.use(cors());
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Get all price data points between specified timestamps and filtered by contractId
  app.get("/prices", async (req, res) => {
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }
    if (contractId) {
      where.contractId = contractId;
    }

    const prices = await priceRepository.find({ where });
    res.json(prices);
  });

  // Get data for rendering candlestick/boxplot charts filtered by contractId
  app.get("/prices/chart-data", async (req, res) => {
    // TODO: GET MARKET PRICE
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }
    if (contractId) {
      where.contractId = contractId;
    }

    const prices = await priceRepository.find({
      where,
      order: {
        timestamp: "ASC",
      },
    });

    if (prices.length === 0) {
      return res.status(404).json({
        error: "No data found for the specified range and contractId",
      });
    }

    // Group prices by date (ignoring time)
    const groupedPrices: { [date: string]: any[] } = prices.reduce(
      (acc: Record<string, any[]>, price) => {
        const date = new Date(Number(price.timestamp) * 1000)
          .toISOString()
          .split("T")[0];
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(price);
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Create candlestick data from grouped prices
    const chartData = Object.entries(groupedPrices).map(([date, prices]) => {
      const open = prices[0].value; // First price of the day
      const close = prices[prices.length - 1].value; // Last price of the day
      const high = Math.max(...prices.map((p) => p.value)); // Highest price of the day
      const low = Math.min(...prices.map((p) => p.value)); // Lowest price of the day

      return {
        date,
        open,
        close,
        low,
        high,
      };
    });

    res.json(chartData);
  });

  // Get average price over a specified time period filtered by contractId
  app.get("/prices/average", async (req, res) => {
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }
    if (contractId) {
      where.contractId = contractId;
    }

    const prices = await priceRepository.find({
      where,
      order: { timestamp: "ASC" },
    });

    if (prices.length === 0) {
      return res.status(404).json({
        error: "No data found for the specified range and contractId",
      });
    }

    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < prices.length - 1; i++) {
      const currentPrice = prices[i];
      const nextPrice = prices[i + 1];
      const timeDiff =
        Number(nextPrice.timestamp) - Number(currentPrice.timestamp);

      totalWeight += timeDiff;
      weightedSum += Number(currentPrice.value) * timeDiff;
    }

    // Handle the last price point if needed (consider it until the endTimestamp or a default time span)
    const lastPrice = prices[prices.length - 1];
    const endTime = endTimestamp
      ? Number(endTimestamp)
      : Number(lastPrice.timestamp);
    const timeDiff = endTime - Number(lastPrice.timestamp);

    totalWeight += timeDiff;
    weightedSum += Number(lastPrice.value) * timeDiff;

    const weightedAverage = weightedSum / totalWeight;

    res.json({ average: weightedAverage });
  });

  app.get("/positions", async (req, res) => {
    const { contractId, isLP } = req.query;
    const where: any = {};

    if (contractId) {
      where.contractId = contractId;
    }
    if (isLP !== undefined) {
      where.isLP = isLP === "true";
    }

    try {
      const positions = await positionRepository.find({ where });
      res.json(positions);
      return;
    } catch (e) {
      console.log("Unable to get positions: ", e);
      res.json([]);
    }
  });
};
startServer().catch((e) => console.error("Unable to start server: ", e));
