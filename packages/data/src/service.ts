import "reflect-metadata";
import cors from "cors";
import { Price } from "./entity/Price";
import { Position } from "./entity/Position";
import express from "express";
import { Between } from "typeorm";
import dataSource from "./db";

const PORT = 3001;

const app = express();
app.use(express.json());
app.use(cors());

dataSource
  .initialize()
  .then(async (connection) => {
    const priceRepository = connection.getRepository(Price);
    const positionRepository = connection.getRepository(Position);

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

    app.get("/prices/chart-data", async (req, res) => {
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
          const date = new Date(price.timestamp * 1000)
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
        const timeDiff = nextPrice.timestamp - currentPrice.timestamp;

        totalWeight += timeDiff;
        weightedSum += currentPrice.value * timeDiff;
      }

      // Handle the last price point if needed (consider it until the endTimestamp or a default time span)
      const lastPrice = prices[prices.length - 1];
      const endTime = endTimestamp ? Number(endTimestamp) : lastPrice.timestamp;
      const timeDiff = endTime - lastPrice.timestamp;

      totalWeight += timeDiff;
      weightedSum += lastPrice.value * timeDiff;

      const weightedAverage = weightedSum / totalWeight;

      res.json({ average: weightedAverage });
    });

    // Get data for rendering candlestick/boxplot charts filtered by contractId
    app.get("/prices/chart-data", async (req, res) => {
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

      const chartData = prices.map((price) => ({
        timestamp: price.timestamp,
        value: price.value,
      }));

      res.json(chartData);
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

      const positions = await positionRepository.find({ where });
      res.json(positions);
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => console.log(error));
