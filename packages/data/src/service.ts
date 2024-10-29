import "reflect-metadata";
import dataSource, {
  eventRepository,
  initializeDataSource,
  renderJobRepository,
} from "./db"; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from "cors";
import { ResourcePrice } from "./models/ResourcePrice";
import { IndexPrice } from "./models/IndexPrice";
import { Position } from "./models/Position";
import { Market } from "./models/Market";
import express from "express";
import { Between } from "typeorm";
import { Transaction } from "./models/Transaction";
import { Epoch } from "./models/Epoch";
import { formatUnits } from "viem";
import { TOKEN_PRECISION } from "./constants";
import {
  getMarketPricesInTimeRange,
  getIndexPricesInTimeRange,
  getStartTimestampFromTimeWindow,
  getTransactionsInTimeRange,
  groupMarketPricesByTimeWindow,
  groupTransactionsByTimeWindow,
  groupIndexPricesByTimeWindow,
} from "./serviceUtil";
import { TimeWindow } from "./interfaces";
import { formatDbBigInt, getBlockBeforeTimestamp } from "./helpers";
import { getProviderForChain } from "./helpers";
import dotenv from "dotenv";
import path from "path";
import { RenderJob } from "./models/RenderJob";
import { getMarketStartEndBlock } from "./controllers/marketHelpers";

const PORT = 3001;

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const startServer = async () => {
  await initializeDataSource();
  const positionRepository = dataSource.getRepository(Position);
  const epochRepository = dataSource.getRepository(Epoch);
  const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
  const indexPriceRepository = dataSource.getRepository(IndexPrice);
  const marketRepository = dataSource.getRepository(Market);
  const transactionRepository = dataSource.getRepository(Transaction);

  const app = express();
  // Middleware to parse JSON bodies
  app.use(express.json());

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

  // Get index prices for a specified epoch and time window
  app.get("/prices/index", async (req, res) => {
    let { contractId, epochId, timeWindow } = req.query;

    if (typeof contractId !== "string" || typeof epochId !== "string") {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    if (!timeWindow) {
      timeWindow = TimeWindow.W;
    }
    const [chainId, address] = contractId.split(":");

    try {
      const market = await marketRepository.findOne({
        where: {
          chainId: Number(chainId),
          address: address,
        },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      const epoch = await epochRepository.findOne({
        where: {
          market: { id: market.id },
          epochId: Number(epochId),
        },
      });

      if (!epoch) {
        return res.status(404).json({ error: "Epoch not found" });
      }

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
        return res.status(404).json({
          error: "No price data found for the specified epoch and time window",
        });
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
    } catch (error) {
      console.error("Error fetching index prices:", error);
      res.status(500).json({ error: "Internal server error" });
    }
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
        order: { positionId: "ASC" },
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

  app.get("/missing-blocks", async (req, res) => {
    const { chainId, address, epochId, model } = req.query;

    if (
      typeof chainId !== "string" ||
      typeof address !== "string" ||
      typeof epochId !== "string" ||
      typeof model !== "string"
    ) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    try {
      // Find the market
      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address },
      });
      if (!market) {
        return res.status(500).json({ error: "Market not found" });
      }
      // get block numbers
      const { startBlockNumber, endBlockNumber, error } =
        await getMarketStartEndBlock(market, epochId);
      if (error || !startBlockNumber || !endBlockNumber) {
        return res.status(500).json({ error });
      }
      console.log("startBlockNumber", startBlockNumber);
      console.log("endBlockNumber", endBlockNumber);

      let existingBlockNumbersSet: Set<number> = new Set();
      if (model === "ResourcePrice") {
        const resourcePrices = await resourcePriceRepository.find({
          where: {
            market: { id: market.id },
            blockNumber: Between(startBlockNumber, endBlockNumber),
          },
          select: ["blockNumber"],
        });

        existingBlockNumbersSet = new Set(
          resourcePrices.map((ip) => Number(ip.blockNumber))
        );
      } else if (model === "Event") {
        // Retrieve all indexed block numbers within the range from the ResourcePrice repository
        const events = await eventRepository.find({
          where: {
            market: { id: market.id },
            blockNumber: Between(startBlockNumber, endBlockNumber),
          },
          select: ["blockNumber"],
        });

        existingBlockNumbersSet = new Set(
          events.map((ip) => Number(ip.blockNumber))
        );
      } else {
        return res.status(500).json({ error: "Invalid model" });
      }

      // Find missing block numbers within the range
      const missingBlockNumbers = [];
      for (
        let blockNumber = startBlockNumber;
        blockNumber <= endBlockNumber;
        blockNumber++
      ) {
        if (!existingBlockNumbersSet.has(blockNumber)) {
          missingBlockNumbers.push(blockNumber);
        }
      }

      res.json({ missingBlockNumbers });
    } catch (error) {
      console.error("Error fetching missing blocks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/reindex", async (req, res) => {
    const { address, chainId } = req.query;
    if (typeof chainId !== "string" || typeof address !== "string") {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    try {
      const RENDER_API_KEY = process.env.RENDER_API_KEY;
      if (!RENDER_API_KEY) {
        throw new Error("RENDER_API_KEY not set");
      }

      async function fetchRenderServices() {
        const url = "https://api.render.com/v1/services?limit=100";

        const response = await fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${RENDER_API_KEY}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
      }

      async function createRenderJob(serviceId: string, startCommand: string) {
        const url = `https://api.render.com/v1/services/${serviceId}/jobs`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startCommand: startCommand,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
      }

      let id: string = "";
      const renderServices: any[] = await fetchRenderServices();
      for (const item of renderServices) {
        if (item?.service?.name === "background-worker" && item?.service?.id) {
          id = item?.service.id;
          break;
        }
      }
      if (!id) {
        throw new Error("Background worker not found");
      }
      console.log("id = ", id);
      // const startCommand = `node -e "require('./packages/data/src/worker').reindexMarket('${chainId}', '${address}')"`;
      const startCommand = `pnpm run start:reindex ${chainId} ${address}`;
      const job = await createRenderJob(id, startCommand);
      console.log("job", job);
      const jobDb = new RenderJob();
      jobDb.jobId = job.id;
      jobDb.serviceId = job.serviceId;
      await renderJobRepository.save(jobDb);
      res.json({ success: true, job });
    } catch (error) {
      console.error("Error reindexing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/reindexStatus", async (req, res) => {
    const { jobId, serviceId } = req.query;
    if (typeof jobId !== "string" || typeof serviceId !== "string") {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    try {
      const RENDER_API_KEY = process.env.RENDER_API_KEY;
      if (!RENDER_API_KEY) {
        throw new Error("RENDER_API_KEY not set");
      }

      const url = `https://api.render.com/v1/services/${serviceId}/jobs/${jobId}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${RENDER_API_KEY}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const job = await response.json();
      console.log("job", job);
      res.json({ success: true, job });
    } catch (error) {
      console.error("Error fetching job status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/prices/index/latest", async (req, res) => {
    const { contractId, epochId } = req.query;

    if (typeof contractId !== "string" || typeof epochId !== "string") {
      return res.status(400).json({ error: "Invalid request parameters" });
    }
    const [chainId, address] = contractId.split(":");

    try {
      const market = await marketRepository.findOne({
        where: {
          chainId: Number(chainId),
          address: address,
        },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      const epoch = await epochRepository.findOne({
        where: {
          market: { id: market.id },
          epochId: Number(epochId),
        },
      });

      if (!epoch) {
        return res.status(404).json({ error: "Epoch not found" });
      }

      const latestPrice = await indexPriceRepository.findOne({
        where: {
          epoch: { id: Number(epoch.id) },
          timestamp: Between(
            Number(epoch.startTimestamp),
            Number(epoch.endTimestamp)
          ),
        },
        order: { timestamp: "DESC" },
      });

      if (!latestPrice) {
        return res.status(404).json({
          error: "No price data found for the specified epoch",
        });
      }

      res.json({
        timestamp: Number(latestPrice.timestamp),
        price: Number(latestPrice.value),
      });
    } catch (error) {
      console.error("Error fetching latest index price:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/updateMarketPrivacy", async (req, res) => {
    const { address, chainId } = req.body;
    try {
      const market = await marketRepository.findOne({
        where: {
          chainId: Number(chainId),
          address: address,
        },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      market.public = !market.public;

      await marketRepository.save(market);

      res.json({ success: true });
    } catch (e) {
      console.error("Error updating market privacy:", e);
      res.status(500).json({ error: `Internal server error: ${e}` });
    }
  });

  app.get("/getStEthPerTokenAtTimestamp", async (req, res) => {
    const { chainId, collateralAssetAddress, endTime } = req.query;

    if (
      typeof chainId !== "string" ||
      typeof collateralAssetAddress !== "string"
    ) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    try {
      const client = getProviderForChain(Number(chainId));

      // get last block
      const block = await getBlockBeforeTimestamp(client, Number(endTime));
      console.log("block number:", block.number);

      if (!block.number) {
        return res.status(404).json({ error: "Block not found" });
      }

      const stEthPerTokenResult = await client.readContract({
        address: collateralAssetAddress as `0x${string}`,
        abi: [
          {
            inputs: [],
            name: "stEthPerToken",
            outputs: [
              {
                internalType: "uint256",
                name: "",
                type: "uint256",
              },
            ],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "stEthPerToken",
        blockNumber: block.number,
      });

      console.log("stEthPerTokenResult =", stEthPerTokenResult);

      res.json({
        stEthPerToken: stEthPerTokenResult.toString(),
      });
    } catch (error) {
      console.error("Error fetching latest resource price:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/accounts/:address", async (req, res) => {
    const { address } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address format" });
    }

    try {
      const positions = await positionRepository.find({
        where: { owner: address },
        relations: ["epoch", "epoch.market"],
      });

      const transactions = await transactionRepository.find({
        where: { position: { owner: address } },
        relations: [
          "position",
          "position.epoch",
          "position.epoch.market",
          "event",
        ],
      });

      positions.forEach((position) => {
        position.baseToken = formatDbBigInt(position.baseToken);
        position.quoteToken = formatDbBigInt(position.quoteToken);
        position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
        position.borrowedQuoteToken = formatDbBigInt(
          position.borrowedQuoteToken
        );
        position.collateral = formatDbBigInt(position.collateral);
      });

      transactions.forEach((transaction) => {
        transaction.baseTokenDelta = formatDbBigInt(transaction.baseTokenDelta);
        transaction.quoteTokenDelta = formatDbBigInt(
          transaction.quoteTokenDelta
        );
        transaction.collateralDelta = formatDbBigInt(
          transaction.collateralDelta
        );
        transaction.tradeRatioD18 = formatDbBigInt(transaction.tradeRatioD18);
      });

      res.json({ positions, transactions });
    } catch (error) {
      console.error("Error fetching account data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/estimate", async (req, res) => {
    const { walletAddress, chainId, marketAddress, epochId } = req.body;
    if (
      typeof walletAddress !== "string" ||
      typeof chainId !== "string" ||
      typeof marketAddress !== "string" ||
      typeof epochId !== "string"
    ) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    try {
      const market = await marketRepository.findOne({
        where: {
          chainId: Number(chainId),
          address: marketAddress,
        },
      });

      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      const epoch = await epochRepository.findOne({
        where: {
          market: { id: market.id },
          epochId: Number(epochId),
        },
      });

      if (!epoch) {
        return res.status(404).json({ error: "Epoch not found" });
      }

      const duration = Number(epoch.endTimestamp) - Number(epoch.startTimestamp);

      // Fetch transactions from Etherscan
      const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
      if (!ETHERSCAN_API_KEY) {
        throw new Error("ETHERSCAN_API_KEY not configured");
      }

      let totalGasUsed = 0;
      let page = 1;
      const offset = 1000; // Number of records per page
      
      while (true) {
        // TODO: change etherscan endpoint based on chainId (mainnet, sepolia, etc) but chainId is where the contract is, not the resource
        const response = await fetch(
          `https://api.etherscan.io/api?module=account&action=txlist` +
          `&address=${walletAddress}` +
          `&startblock=0` +
          `&endblock=99999999` +
          `&page=${page}` +
          `&offset=${offset}` +
          `&sort=desc` +
          `&apikey=${ETHERSCAN_API_KEY}`
        );

        const data = await response.json();
        
        if (data.status !== "1" || !data.result.length) {
          break;
        }

        // Filter transactions within duration and sum gas used
        const currentTime = Math.floor(Date.now() / 1000);
        const startTime = currentTime - duration;

        for (const tx of data.result) {
          if (Number(tx.timeStamp) >= startTime) {
            totalGasUsed += Number(tx.gasUsed);
          } else {
            // Since results are sorted by desc, we can break early
            break;
          }
        }

        // If we got less than the requested offset, there are no more pages
        if (data.result.length < offset) {
          break;
        }
        
        page++;
      }

      res.json({ duration, totalGasUsed });
    } catch (error) {
      console.error("Error calculating gas usage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

};
startServer().catch((e) => console.error("Unable to start server: ", e));
