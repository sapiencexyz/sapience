import "reflect-metadata";
import dataSource, { initializeDataSource } from "./db"; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from "cors";
import { IndexPrice } from "./entity/IndexPrice";
import { Position } from "./entity/Position";
import { Market } from "./entity/Market";
import express from "express";
import { Between } from "typeorm";
import { Transaction } from "./entity/Transaction";
import { Epoch } from "./entity/Epoch";
import { MarketPrice } from "./entity/MarketPrice";
import { formatUnits } from "viem";
import { TOKEN_PRECISION } from "./constants";
import {
  getMarketPricesInTimeRange,
  getStartTimestampFromTimeWindow,
  getTransactionsInTimeRange,
  groupMarketPricesByTimeWindow,
  groupTransactionsByTimeWindow,
} from "./serviceUtil";
import { TimeWindow } from "./interfaces";
import { formatDbBigInt } from "./helpers";

const PORT = 3001;

const startServer = async () => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);
  const epochRepository = dataSource.getRepository(Epoch);
  const priceRepository = dataSource.getRepository(IndexPrice);
  const marketRepository = dataSource.getRepository(Market);
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
        (/^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin) ||
          /^https?:\/\/localhost(:\d+)?$/.test(origin) || // local testing
          /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) //staging sites
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  app.get("/markets", async (req, res) => {
    try {
      const markets = await marketRepository.find({
        where: { public: true },
        relations: ["epochs"],
      });

      const formattedMarkets = markets.map((market) => ({
        ...market,
        epochs: market.epochs.map((epoch) => ({
          ...epoch,
          startTimestamp: Number(epoch.startTimestamp),
          endTimestamp: Number(epoch.endTimestamp),
        })),
      }));

      res.json(formattedMarkets);
    } catch (error) {
      console.error("Error fetching markets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get market price data for rendering candlestick/boxplot charts filtered by contractId
  app.get("/prices/chart-data", async (req, res) => {
    const { contractId, epochId, timeWindow } = req.query;

    if (
      typeof contractId !== "string" ||
      typeof epochId !== "string" ||
      typeof timeWindow !== "string"
    ) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const endTimestamp = Math.floor(Date.now() / 1000);
      const startTimestamp = getStartTimestampFromTimeWindow(
        timeWindow as TimeWindow
      );

      const marketPrices = await getMarketPricesInTimeRange(
        startTimestamp,
        endTimestamp,
        chainId,
        address,
        epochId
      );

      const groupedPrices = groupMarketPricesByTimeWindow(
        marketPrices,
        timeWindow as TimeWindow
      );

      // Create candlestick data from grouped prices
      const chartData = groupedPrices.map((group) => {
        const prices = group.entities;
        const open = prices[0]?.value || 0;
        const close = prices[prices.length - 1]?.value || 0;
        const high = Math.max(...prices.map((p) => Number(p.value)));
        const low = Math.min(...prices.map((p) => Number(p.value)));
        return {
          startTimestamp: group.startTimestamp,
          endTimestamp: group.endTimestamp,
          open,
          close,
          low,
          high,
        };
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
        address: address,
      },
    });

    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }

    // Find the epoch within the market
    const epoch = await epochRepository.findOne({
      where: {
        market: { id: market.id },
        epochId: Number(epochId),
      },
    });

    if (!epoch) {
      return res.status(404).json({ error: "Epoch not found" });
    }

    const startTimestamp = epoch.startTimestamp;
    const endTimestamp = epoch.endTimestamp;

    // Construct the where clause
    const where: any = {
      market: { id: market.id },
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

    // prevent divide by zero
    if (totalWeight === 0n) {
      totalWeight = 1n;
    }

    const weightedAverage = Number(weightedSum / totalWeight);

    res.json({ average: weightedAverage });
  });

  app.get("/positions", async (req, res) => {
    const { isLP, contractId } = req.query;

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
        position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
        position.borrowedQuoteToken = formatDbBigInt(
          position.borrowedQuoteToken
        );
        position.collateral = formatDbBigInt(position.collateral);
      }
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get a single position by positionId
  app.get("/positions/:positionId", async (req, res) => {
    const { positionId } = req.params;
    const { contractId } = req.query;

    if (typeof positionId !== "string" || typeof contractId !== "string") {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const [chainId, address] = contractId.split(":");

    try {
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      const position = await positionRepository.findOne({
        where: {
          positionId: Number(positionId),
          epoch: { market: { id: market.id } },
        },
        relations: ["epoch", "epoch.market"],
      });

      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      // Format the data
      position.baseToken = formatDbBigInt(position.baseToken);
      position.quoteToken = formatDbBigInt(position.quoteToken);
      position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
      position.borrowedQuoteToken = formatDbBigInt(position.borrowedQuoteToken);
      position.collateral = formatDbBigInt(position.collateral);

      res.json(position);
    } catch (error) {
      console.error("Error fetching position:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/transactions", async (req, res) => {
    const { contractId, epochId, positionId } = req.query;

    if (typeof contractId !== "string") {
      return res.status(400).json({ error: "Invalid contractId" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const queryBuilder = transactionRepository
        .createQueryBuilder("transaction")
        .innerJoinAndSelect("transaction.position", "position")
        .innerJoinAndSelect("position.epoch", "epoch")
        .innerJoinAndSelect("epoch.market", "market")
        .innerJoinAndSelect("transaction.event", "event") // Join Event data
        .where("market.chainId = :chainId", { chainId })
        .andWhere("market.address = :address", { address });

      if (epochId) {
        queryBuilder.andWhere("epoch.epochId = :epochId", { epochId });
      }

      if (positionId) {
        queryBuilder.andWhere("position.positionId = :positionId", {
          positionId,
        });
      }

      const transactions = await queryBuilder.getMany();

      // format data
      for (const transaction of transactions) {
        transaction.baseTokenDelta = formatDbBigInt(transaction.baseTokenDelta);
        transaction.quoteTokenDelta = formatDbBigInt(
          transaction.quoteTokenDelta
        );
        transaction.collateralDelta = formatDbBigInt(
          transaction.collateralDelta
        );
        transaction.tradeRatioD18 = formatDbBigInt(transaction.tradeRatioD18);
      }
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/volume", async (req, res) => {
    const { timeWindow, contractId, epochId } = req.query;

    if (
      typeof contractId !== "string" ||
      typeof timeWindow !== "string" ||
      typeof epochId !== "string"
    ) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const endTimestamp = Math.floor(Date.now() / 1000);
      const startTimestamp = getStartTimestampFromTimeWindow(
        timeWindow as TimeWindow
      );
      const transactions = await getTransactionsInTimeRange(
        startTimestamp,
        endTimestamp,
        chainId,
        address
      );
      const groupedTransactions = groupTransactionsByTimeWindow(
        transactions,
        timeWindow as TimeWindow
      );

      const volume = groupedTransactions.map((group) => {
        return {
          startTimestamp: group.startTimestamp,
          endTimestamp: group.endTimestamp,
          volume: group.entities.reduce((sum, transaction) => {
            // Convert baseTokenDelta to BigNumber and get its absolute value
            const absBaseTokenDelta = Math.abs(
              parseFloat(
                formatUnits(BigInt(transaction.baseTokenDelta), TOKEN_PRECISION)
              )
            );

            // Add to the sum
            return sum + absBaseTokenDelta;
          }, 0),
        };
      });
      res.json(volume);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};
startServer().catch((e) => console.error("Unable to start server: ", e));
