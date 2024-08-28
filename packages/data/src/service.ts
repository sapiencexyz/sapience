import "reflect-metadata";
import dataSource, { initializeDataSource } from "./db"; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from "cors";
import { Price } from "./entity/Price";
import { Position } from "./entity/Position";
import { Market } from "./entity/Market";
import express from "express";
import { Between } from "typeorm";
import { Event } from "./entity/Event";

const PORT = 3001;

const startServer = async () => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);
  const eventRepository = dataSource.getRepository(Event);
  const priceRepository = dataSource.getRepository(Price);
  const marketRepository = dataSource.getRepository(Market);

  const app = express();
  app.use(cors());
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Get all price data points between specified timestamps and filtered by market
  app.get("/prices", async (req, res) => {
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const [chainId, address] = (contractId as string).split(":");
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }

    if (chainId && address) {
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }
      where.market = market;
    }

    const prices = await priceRepository.find({
      where,
      relations: ["market"],
      order: { timestamp: "ASC" },
    });
    res.json(prices);
  });

  // Get data for rendering candlestick/boxplot charts filtered by contractId
  app.get("/prices/chart-data", async (req, res) => {
    // TODO: GET MARKET PRICE
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const [chainId, address] = (contractId as string).split(":");
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }

    if (chainId && address) {
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }
      where.market = market;
    }

    const prices = await priceRepository.find({
      where,
      relations: ["market"],
      order: { timestamp: "ASC" },
    });

    if (prices.length === 0) {
      return res.status(404).json({
        error: "No data found for the specified range and market",
      });
    }

    // Group prices by date (ignoring time)
    const groupedPrices = prices.reduce(
      (acc, price) => {
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
      const open = prices[0].value;
      const close = prices[prices.length - 1].value;
      const high = Math.max(...prices.map((p) => Number(p.value)));
      const low = Math.min(...prices.map((p) => Number(p.value)));
      return { date, open, close, low, high };
    });

    res.json(chartData);
  });

  // Get average price over a specified time period filtered by market
  app.get("/prices/average", async (req, res) => {
    const { startTimestamp, endTimestamp, contractId } = req.query;
    const [chainId, address] = (contractId as string).split(":");
    const where: any = {};

    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
    }

    if (chainId && address) {
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }
      where.market = market;
    }

    const prices = await priceRepository.find({
      where,
      relations: ["market"],
      order: { timestamp: "ASC" },
    });

    if (prices.length === 0) {
      return res.status(404).json({
        error: "No data found for the specified range and market",
      });
    }

    let totalWeight = 0n;
    let weightedSum = 0n;

    for (let i = 0; i < prices.length - 1; i++) {
      const currentPrice = prices[i];
      const nextPrice = prices[i + 1];
      const timeDiff =
        BigInt(nextPrice.timestamp) - BigInt(currentPrice.timestamp);

      totalWeight += timeDiff;
      weightedSum += BigInt(currentPrice.value) * timeDiff;
    }

    // Handle the last price point
    const lastPrice = prices[prices.length - 1];
    const endTime = endTimestamp
      ? BigInt(endTimestamp as string)
      : BigInt(lastPrice.timestamp);
    const timeDiff = endTime - BigInt(lastPrice.timestamp);

    totalWeight += timeDiff;
    weightedSum += BigInt(lastPrice.value) * timeDiff;

    const weightedAverage = Number(weightedSum / totalWeight);

    res.json({ average: weightedAverage });
  });

  app.get("/positions", async (req, res) => {
    const { isLP, contractId } = req.query;
    const all = await positionRepository.find({
      relations: ["epoch", "epoch.market"],
    });
    console.log("all positions -", all);
    if (typeof contractId !== "string") {
      return res.status(400).json({ error: "Invalid contractId" });
    }

    const [chainId, address] = contractId.split(":");
    const where: any = {};

    if (chainId && address) {
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      // Query for positions related to any epoch of this market
      where.epoch = { market: { id: market.id } };
    } else {
      return res.status(400).json({ error: "Invalid contractId format" });
    }

    // if (isLP !== undefined) {
    where.isLP = isLP === "true";
    // }
    console.log("where -", where);
    try {
      const positions = await positionRepository.find({
        where,
        relations: ["epoch", "epoch.market"],
      });
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};
startServer().catch((e) => console.error("Unable to start server: ", e));
