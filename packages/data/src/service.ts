import "reflect-metadata";
import dataSource, { initializeDataSource } from "./db"; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from "cors";
import { Price } from "./entity/Price";
import { Position } from "./entity/Position";
import { Market } from "./entity/Market";
import express from "express";
import { Between } from "typeorm";
import { Event } from "./entity/Event";
import { Transaction } from "./entity/Transaction";
import { Epoch } from "./entity/Epoch";
import { MarketPrice } from "./entity/MarketPrice";
import { formatUnits } from "viem";
import { formatDbBigInt, TOKEN_PRECISION } from "./util/dbUtil";

const PORT = 3001;

const startServer = async () => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);
  const eventRepository = dataSource.getRepository(Event);
  const epochRepository = dataSource.getRepository(Epoch);
  const priceRepository = dataSource.getRepository(Price);
  const marketRepository = dataSource.getRepository(Market);
  const marketPriceRepository = dataSource.getRepository(MarketPrice);
  const transactionRepository = dataSource.getRepository(Transaction);

  const app = express();

  const corsOptions: cors.CorsOptions = {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else if (
        origin &&
        /^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin)
      ) {
        callback(null, true);
      } else {
        console.log("process.env.NODE_ENV =", process.env.NODE_ENV);
        callback(new Error("Not allowed by CORS"));
      }
    },
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Get market price data for rendering candlestick/boxplot charts filtered by contractId
  app.get("/prices/chart-data", async (req, res) => {
    const all = await marketPriceRepository.find({
      relations: {
        transaction: true,
      },
    });

    const { contractId, epochId } = req.query;

    if (typeof contractId !== "string") {
      return res.status(400).json({ error: "Invalid contractId" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const marketPrices = await marketPriceRepository
        .createQueryBuilder("marketPrice")
        .innerJoinAndSelect("marketPrice.transaction", "transaction")
        .innerJoinAndSelect("transaction.event", "event")
        .innerJoinAndSelect("event.epoch", "epoch")
        .innerJoinAndSelect("epoch.market", "market")
        .where("market.chainId = :chainId", { chainId })
        .andWhere("market.address = :address", { address })
        .andWhere("epoch.epochId = :epochId", { epochId })
        .orderBy("marketPrice.timestamp", "DESC")
        .getMany();

      console.log("marketPrices = ", marketPrices);

      // Group prices by date (ignoring time)
      const groupedPrices = marketPrices.reduce(
        (acc, price) => {
          const date = new Date(Number(price.timestamp) * 1000)
            .toISOString()
            .split("T")[0];
          if (!acc[date]) {
            acc[date] = [];
          }
          price.value = formatUnits(BigInt(price.value), TOKEN_PRECISION);
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
    } catch (error) {
      console.error("Error fetching market prices:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get average price over a specified time period filtered by market
  app.get("/prices/average", async (req, res) => {
    const { contractId, epochId } = req.query;
    const [chainId, address] = (contractId as string).split(":");
  
    // Find the market
    const market = await marketRepository.findOne({
      where: {
        chainId: Number(chainId),
        address: address
      }
    });
  
    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }
  
    // Find the epoch within the market
    const epoch = await epochRepository.findOne({
      where: {
        market: { id: market.id },
        epochId: Number(epochId)
      }
    });
  
    if (!epoch) {
      return res.status(404).json({ error: "Epoch not found" });
    }
  
    const startTimestamp = epoch.startTimestamp;
    const endTimestamp = epoch.endTimestamp;
  
    // Construct the where clause
    const where: any = {
      market: { id: market.id }
    };
  
    if (startTimestamp && endTimestamp) {
      where.timestamp = Between(startTimestamp, endTimestamp);
    }
  
    const prices = await priceRepository.find({
      where,
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
      ? BigInt(endTimestamp)
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
      relations: ["epoch", "epoch.market", "transactions"],
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

    where.isLP = isLP === "true";

    try {
      const positions = await positionRepository.find({
        where,
        relations: ["epoch", "epoch.market"],
      });
      // format the data
      for (const position of positions) {
        position.baseToken = formatDbBigInt(position.baseToken);
        position.quoteToken = formatDbBigInt(position.quoteToken);
        position.collateral = formatDbBigInt(position.collateral);
        position.profitLoss = formatDbBigInt(position.profitLoss);
        position.unclaimedFees = formatDbBigInt(position.unclaimedFees);
      }
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app.get("/transactions", async (req, res) => {
    const all = await transactionRepository.find({
      relations: {
        position: true,
        event: true,
      },
    });
    console.log("all txns -", all);
    const { contractId, epochId } = req.query;

    if (typeof contractId !== "string") {
      return res.status(400).json({ error: "Invalid contractId" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const transactions = await transactionRepository
        .createQueryBuilder("transaction")
        .innerJoinAndSelect("transaction.position", "position")
        .innerJoinAndSelect("position.epoch", "epoch")
        .innerJoinAndSelect("epoch.market", "market")
        .innerJoinAndSelect("transaction.event", "event") // Join Event data
        .where("market.chainId = :chainId", { chainId })
        .andWhere("market.address = :address", { address })
        .andWhere("epoch.epochId = :epochId", { epochId })
        .getMany();

      // format data
      for (const transaction of transactions) {
        transaction.baseTokenDelta = formatDbBigInt(transaction.baseTokenDelta);
        transaction.quoteTokenDelta = formatDbBigInt(
          transaction.quoteTokenDelta
        );
        transaction.collateralDelta = formatDbBigInt(
          transaction.collateralDelta
        );
      }
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};
startServer().catch((e) => console.error("Unable to start server: ", e));
