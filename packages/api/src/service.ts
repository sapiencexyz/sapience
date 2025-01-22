import 'reflect-metadata';
import initSentry from './instrument';
import dataSource, { initializeDataSource, renderJobRepository } from './db'; /// !IMPORTANT: Keep as top import to prevent issues with db initialization
import cors from 'cors';
import { ResourcePrice } from './models/ResourcePrice';
import { IndexPrice } from './models/IndexPrice';
import { Position } from './models/Position';
import { Market } from './models/Market';
import express, { Request, Response, NextFunction } from 'express';
import { Between, In, Repository } from 'typeorm';
import { Transaction } from './models/Transaction';
import { Epoch } from './models/Epoch';
import { formatUnits } from 'viem';
import {
  TOKEN_PRECISION,
  WSTETH_ADDRESS_SEPOLIA,
  WSTETH_ADDRESS_MAINNET,
} from './constants';
import {
  getMarketPricesInTimeRange,
  getIndexPricesInTimeRange,
  getStartTimestampFromTimeWindow,
  getTransactionsInTimeRange,
  groupMarketPricesByTimeWindow,
  groupTransactionsByTimeWindow,
  groupIndexPricesByTimeWindow,
} from './serviceUtil';
import { TimeWindow } from './interfaces';
import {
  formatDbBigInt,
  getBlockBeforeTimestamp,
  getChainById,
  mainnetPublicClient,
  sepoliaPublicClient,
} from './helpers';
import { getProviderForChain } from './helpers';
import dotenv from 'dotenv';
import path from 'path';
import { RenderJob } from './models/RenderJob';
import { getMarketStartEndBlock } from './controllers/marketHelpers';
import { isValidWalletSignature } from './middleware';
import * as Sentry from '@sentry/node';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MARKETS } from './fixtures';
import { Resource } from './models/Resource';
import { buildSchema } from 'type-graphql';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import {
  MarketResolver,
  ResourceResolver,
  PositionResolver,
  TransactionResolver,
  EpochResolver,
} from './graphql/resolvers';
import { createLoaders } from './graphql/loaders';

const PORT = 3001;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else if (
      !origin || // Allow same-origin requests
      /^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin) ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) || // local testing
      /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin) //staging sites
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
};

const executeLocalReindex = async (
  startCommand: string
): Promise<{ id: string; status: string; output: string }> => {
  return new Promise((resolve, reject) => {
    // Use dynamic import for child_process
    import('child_process')
      .then(({ spawn }) => {
        const [command, ...args] = startCommand.split(' ');

        const process = spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let output = '';

        process.stdout.on('data', (data: Buffer) => {
          output += data;
        });

        process.stderr.on('data', (data: Buffer) => {
          console.error(`Error: ${data}`);
        });

        process.on('close', (code: number) => {
          if (code === 0) {
            resolve({ id: 'local', status: 'completed', output });
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      })
      .catch(() => {
        reject(new Error('Failed to load child_process module'));
      });
  });
};

const startServer = async () => {
  await initializeDataSource();

  // Create GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      MarketResolver,
      ResourceResolver,
      PositionResolver,
      TransactionResolver,
      EpochResolver,
    ],
    emitSchemaFile: true,
    validate: false,
  });

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return error;
    },
    introspection: true,
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
    ],
  });

  // Start Apollo Server
  await apolloServer.start();

  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cors(corsOptions));

  // Add GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({
        loaders: createLoaders(),
      }),
    })
  );

  const positionRepository = dataSource.getRepository(Position);
  const epochRepository = dataSource.getRepository(Epoch);
  const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
  const indexPriceRepository = dataSource.getRepository(IndexPrice);
  const marketRepository = dataSource.getRepository(Market);
  const transactionRepository = dataSource.getRepository(Transaction);

  app.get('/debug-sentry', function mainHandler() {
    throw new Error('My first Sentry error!');
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
  });

  // Helper middleware to handle async errors
  const handleAsyncErrors =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // Helper function to parse and validate contractId
  const parseContractId = (
    contractId: string
  ): { chainId: string; address: string } => {
    const [chainId, address] = contractId.toLowerCase().split(':');
    if (!chainId || !address) {
      throw new Error('Invalid contractId format');
    }
    return { chainId, address };
  };

  // Helper function to get market and epoch
  const getMarketAndEpoch = async (
    marketRepository: Repository<Market>,
    epochRepository: Repository<Epoch>,
    chainId: string,
    address: string,
    epochId: string
  ): Promise<{ market: Market; epoch: Epoch }> => {
    const market = await marketRepository.findOne({
      where: { chainId: Number(chainId), address: address },
    });
    if (!market) {
      throw new Error(
        `Market not found for chainId ${chainId} and address ${address}`
      );
    }
    const epoch = await epochRepository.findOne({
      where: { market: { id: market.id }, epochId: Number(epochId) },
    });
    if (!epoch) {
      throw new Error(
        `Epoch not found for chainId ${chainId} and address ${address} and epochId ${epochId}`
      );
    }
    return { market, epoch };
  };

  // Middleware to validate request parameters
  const validateRequestParams =
    (params: string[]) => (req: Request, res: Response, next: NextFunction) => {
      for (const param of params) {
        if (typeof req.query[param] !== 'string') {
          return res.status(400).json({ error: `Invalid parameter: ${param}` });
        }
      }
      next();
    };

  // Routes

  // route /markets: Get markets
  app.get(
    '/markets',
    handleAsyncErrors(async (req, res) => {
      const markets = await marketRepository.find({
        relations: ['epochs', 'resource'],
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
    })
  );

  // route /prices/chart-data: Get market price data for rendering charts
  app.get(
    '/prices/chart-data',
    validateRequestParams(['contractId', 'epochId', 'timeWindow']),
    handleAsyncErrors(async (req, res) => {
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

      const chartData = groupedPrices.reduce((acc, group) => {
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

  // route /prices/index: Get index prices for a specified epoch and time window
  app.get(
    '/prices/index',
    validateRequestParams(['contractId', 'epochId']),

    handleAsyncErrors(async (req, res) => {
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

  // route /positions: Get positions
  app.get(
    '/positions',
    validateRequestParams(['contractId']),
    handleAsyncErrors(async (req, res) => {
      const { isLP, contractId } = req.query as {
        isLP: string;
        contractId: string;
      };

      const { chainId, address } = parseContractId(contractId);

      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      // Query for positions related to any epoch of this market
      const where = { epoch: { market: { id: market.id } } };

      where.isLP = isLP === 'true';

      const positions = await positionRepository.find({
        where,
        relations: ['epoch', 'epoch.market', 'epoch.market.resource'],
        order: { positionId: 'ASC' },
      });

      // Format the data
      for (const position of positions) {
        position.baseToken = formatDbBigInt(position.baseToken);
        position.quoteToken = formatDbBigInt(position.quoteToken);
        position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
        position.borrowedQuoteToken = formatDbBigInt(
          position.borrowedQuoteToken
        );
        position.collateral = formatDbBigInt(position.collateral);
        position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
        position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);
      }
      res.json(positions);
    })
  );

  // route /positions/:positionId: Get a single position by positionId
  app.get(
    '/positions/:positionId',
    validateRequestParams(['contractId']),
    handleAsyncErrors(async (req, res) => {
      const { positionId } = req.params;
      const { contractId } = req.query as { contractId: string };

      const { chainId, address } = parseContractId(contractId);

      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      const position = await positionRepository.findOne({
        where: {
          positionId: Number(positionId),
          epoch: { market: { id: market.id } },
        },
        relations: ['epoch', 'epoch.market', 'epoch.market.resource'],
      });

      if (!position) {
        res.status(404).json({ error: 'Position not found' });
        return;
      }

      // Format the data
      position.baseToken = formatDbBigInt(position.baseToken);
      position.quoteToken = formatDbBigInt(position.quoteToken);
      position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
      position.borrowedQuoteToken = formatDbBigInt(position.borrowedQuoteToken);
      position.collateral = formatDbBigInt(position.collateral);
      position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
      position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);

      res.json(position);
    })
  );

  // route /transactions: Get transactions
  app.get(
    '/transactions',
    validateRequestParams(['contractId']),
    handleAsyncErrors(async (req, res) => {
      const { contractId, epochId, positionId } = req.query as {
        contractId: string;
        epochId?: string;
        positionId?: string;
      };

      const { chainId, address } = parseContractId(contractId);

      const queryBuilder = transactionRepository
        .createQueryBuilder('transaction')
        .innerJoinAndSelect('transaction.position', 'position')
        .innerJoinAndSelect('position.epoch', 'epoch')
        .innerJoinAndSelect('epoch.market', 'market')
        .innerJoinAndSelect('market.resource', 'resource')
        .innerJoinAndSelect('transaction.event', 'event')
        .where('market.chainId = :chainId', { chainId })
        .andWhere('market.address = :address', { address })
        .orderBy('position.positionId', 'ASC')
        .addOrderBy('event.blockNumber', 'ASC');

      if (epochId) {
        queryBuilder.andWhere('epoch.epochId = :epochId', { epochId });
      }

      if (positionId) {
        queryBuilder.andWhere('position.positionId = :positionId', {
          positionId,
        });
      }

      const transactions = await queryBuilder.getMany();
      const hydratedPositions = hydrateTransactions(transactions);

      res.json(hydratedPositions);
    })
  );

  // route /volume: Get volume
  app.get(
    '/volume',
    validateRequestParams(['contractId', 'timeWindow']),
    handleAsyncErrors(async (req, res) => {
      const { timeWindow, contractId } = req.query as {
        timeWindow: TimeWindow;
        contractId: string;
      };

      const { chainId, address } = parseContractId(contractId);

      const endTimestamp = Math.floor(Date.now() / 1000);
      const startTimestamp = getStartTimestampFromTimeWindow(timeWindow);

      const transactions = await getTransactionsInTimeRange(
        startTimestamp,
        endTimestamp,
        chainId,
        address
      );

      const groupedTransactions = groupTransactionsByTimeWindow(
        transactions,
        timeWindow
      );

      const volume = groupedTransactions.map((group) => {
        return {
          startTimestamp: group.startTimestamp,
          endTimestamp: group.endTimestamp,
          volume: group.entities.reduce((sum, transaction) => {
            // Convert baseTokenDelta to BigNumber and get its absolute value
            const absBaseTokenDelta = Math.abs(
              parseFloat(
                formatUnits(BigInt(transaction.baseToken), TOKEN_PRECISION)
              )
            );

            // Add to the sum
            return sum + absBaseTokenDelta;
          }, 0),
        };
      });
      res.json(volume);
    })
  );

  const getMissingBlocks = async (
    chainId: string,
    address: string,
    epochId: string
  ): Promise<{ missingBlockNumbers: number[] | null; error?: string }> => {
    // Find the market
    const market = await marketRepository.findOne({
      where: { chainId: Number(chainId), address },
      relations: ['resource'],
    });
    if (!market) {
      return { missingBlockNumbers: null, error: 'Market not found' };
    }

    // Find the market info to get the correct chain for price indexing
    const marketInfo = MARKETS.find(
      (m) =>
        m.marketChainId === market.chainId &&
        m.deployment.address.toLowerCase() === market.address.toLowerCase()
    );
    if (!marketInfo) {
      return {
        missingBlockNumbers: null,
        error: 'Market configuration not found',
      };
    }

    // Get block numbers using the price indexer client
    const { startBlockNumber, endBlockNumber, error } =
      await getMarketStartEndBlock(
        market,
        epochId,
        marketInfo.resource.priceIndexer.client
      );

    if (error || !startBlockNumber || !endBlockNumber) {
      return { missingBlockNumbers: null, error };
    }

    // Get existing block numbers for ResourcePrice
    const resourcePrices = await resourcePriceRepository.find({
      where: {
        resource: { id: market.resource.id },
        blockNumber: Between(startBlockNumber, endBlockNumber),
      },
      select: ['blockNumber'],
    });

    const existingBlockNumbersSet = new Set(
      resourcePrices.map((ip) => Number(ip.blockNumber))
    );

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

    return { missingBlockNumbers };
  };

  // route /missing-blocks: Update the missing-blocks endpoint
  app.get(
    '/missing-blocks',
    validateRequestParams(['chainId', 'address', 'epochId']),
    handleAsyncErrors(async (req, res) => {
      const { chainId, address, epochId } = req.query as {
        chainId: string;
        address: string;
        epochId: string;
      };

      const { missingBlockNumbers, error } = await getMissingBlocks(
        chainId,
        address,
        epochId
      );

      if (error) {
        res.status(500).json({ error });
        return;
      }

      res.json({ missingBlockNumbers });
    })
  );

  // route /reindex
  app.post(
    '/reindex',
    validateRequestParams(['address', 'chainId', 'signature', 'timestamp']),
    handleAsyncErrors(async (req, res) => {
      const { address, chainId, signature, timestamp } = req.query as {
        address: string;
        chainId: string;
        signature: string;
        timestamp: string;
      };

      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(timestamp)
      );
      if (!isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const RENDER_API_KEY = process.env.RENDER_API_KEY;
      if (!RENDER_API_KEY) {
        throw new Error('RENDER_API_KEY not set');
      }

      async function fetchRenderServices() {
        const url = 'https://api.render.com/v1/services?limit=100';

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
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
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RENDER_API_KEY}`,
            'Content-Type': 'application/json',
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

      let id: string = '';
      const renderServices = await fetchRenderServices();
      for (const item of renderServices) {
        if (
          item?.service?.type === 'background_worker' &&
          item?.service?.id &&
          (process.env.NODE_ENV === 'staging'
            ? item?.service?.branch === 'staging'
            : item?.service?.branch === 'main')
        ) {
          id = item?.service.id;
          break;
        }
      }
      if (!id) {
        throw new Error('Background worker not found');
      }

      const startCommand = `pnpm run start:reindex ${chainId} ${address}`;
      const job = await createRenderJob(id, startCommand);

      const jobDb = new RenderJob();
      jobDb.jobId = job.id;
      jobDb.serviceId = job.serviceId;
      await renderJobRepository.save(jobDb);
      res.json({ success: true, job });
    })
  );

  // route /reindexStatus
  app.get(
    '/reindexStatus',
    validateRequestParams(['jobId', 'serviceId']),
    handleAsyncErrors(async (req, res) => {
      const { jobId, serviceId } = req.query as {
        jobId: string;
        serviceId: string;
      };

      const RENDER_API_KEY = process.env.RENDER_API_KEY;
      if (!RENDER_API_KEY) {
        throw new Error('RENDER_API_KEY not set');
      }

      const url = `https://api.render.com/v1/services/${serviceId}/jobs/${jobId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${RENDER_API_KEY}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const job = await response.json();
      res.json({ success: true, job });
    })
  );

  // route /prices/index/latest
  app.get(
    '/prices/index/latest',
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

  // route /updateMarketPrivacy
  app.post(
    '/updateMarketPrivacy',
    handleAsyncErrors(async (req, res) => {
      const { address, chainId, signature, timestamp } = req.body;

      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(timestamp)
      );
      if (!isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const market = await marketRepository.findOne({
        where: {
          chainId: Number(chainId),
          address: address,
        },
      });

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      market.public = !market.public;

      await marketRepository.save(market);

      res.json({ success: true });
    })
  );

  // route /getStEthPerTokenAtTimestamp
  app.get(
    '/getStEthPerTokenAtTimestamp',
    validateRequestParams(['chainId']),
    handleAsyncErrors(async (req, res) => {
      const { chainId, endTime } = req.query as {
        chainId: string;
        endTime?: string;
      };

      const chain = getChainById(Number(chainId));

      if (!chain) {
        throw new Error('Chain not found');
      }

      const address = chain.testnet
        ? WSTETH_ADDRESS_SEPOLIA
        : WSTETH_ADDRESS_MAINNET;

      const client = chain.testnet ? sepoliaPublicClient : mainnetPublicClient;

      const block = endTime
        ? await getBlockBeforeTimestamp(client, Number(endTime))
        : null;

      const stEthPerTokenResult = await client.readContract({
        address: address as `0x${string}`,
        abi: [
          {
            inputs: [],
            name: 'stEthPerToken',
            outputs: [
              {
                internalType: 'uint256',
                name: '',
                type: 'uint256',
              },
            ],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'stEthPerToken',
        blockNumber: block?.number ?? undefined,
      });

      res.json({
        stEthPerToken: stEthPerTokenResult.toString(),
      });
    })
  );

  // route /accounts/:address: Get account data (positions and transactions)
  app.get(
    '/accounts/:address',
    handleAsyncErrors(async (req, res) => {
      const { address } = req.params;

      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid address format' });
        return;
      }

      const positions = await positionRepository.find({
        where: { owner: address },
        relations: [
          'epoch',
          'epoch.market',
          'epoch.market.resource',
          'transactions',
        ],
      });

      const transactions = await transactionRepository.find({
        where: { position: { owner: address } },
        relations: [
          'position',
          'position.epoch',
          'position.epoch.market',
          'position.epoch.market.resource',
          'event',
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
        position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
        position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);

        position.transactions = hydrateTransactions(position.transactions);
      });

      const hydratedPositions = hydrateTransactions(transactions);

      res.json({ positions, transactions: hydratedPositions });
    })
  );

  // route /estimate
  app.post(
    '/estimate',
    handleAsyncErrors(async (req, res) => {
      const { walletAddress, chainId, marketAddress, epochId } = req.body;

      const { epoch } = await getMarketAndEpoch(
        marketRepository,
        epochRepository,
        chainId,
        marketAddress.toLowerCase(),
        epochId
      );

      const duration =
        Number(epoch.endTimestamp) - Number(epoch.startTimestamp);
      const startTime = Math.floor(Date.now() / 1000) - duration;

      // Fetch transactions from Etherscan
      const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
      if (!ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY not configured');
      }

      const transactions = [];
      let page = 1;
      const offset = 1000;

      while (true) {
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
        if (data.status !== '1' || !data.result.length) break;

        // Filter transactions within time range
        const relevantTxs = data.result.filter(
          (tx) => Number(tx.timeStamp) >= startTime
        );
        transactions.push(...relevantTxs);

        if (data.result.length < offset) break;
        page++;
      }

      if (transactions.length === 0) {
        res.json({ totalGasUsed: 0 });
        return;
      }

      // Calculate metrics
      const totalGasUsed = transactions.reduce(
        (sum, tx) => sum + Number(tx.gasUsed),
        0
      );
      const totalEthPaid = transactions.reduce(
        (sum, tx) => sum + (Number(tx.gasUsed) * Number(tx.gasPrice)) / 1e18,
        0
      );
      const avgGasPerTx = Math.round(totalGasUsed / transactions.length);
      const avgGasPrice = Math.round(
        transactions.reduce((sum, tx) => sum + Number(tx.gasPrice), 0) /
          transactions.length /
          1e9
      );

      // Generate chart data with 50 buckets
      const bucketDuration = Math.floor(duration / 50);
      const chartData = Array(50)
        .fill(0)
        .map((_, i) => {
          const bucketStart = startTime + i * bucketDuration;
          const bucketEnd = bucketStart + bucketDuration;

          const bucketGasUsed = transactions
            .filter(
              (tx) =>
                Number(tx.timeStamp) >= bucketStart &&
                Number(tx.timeStamp) < bucketEnd
            )
            .reduce((sum, tx) => sum + Number(tx.gasUsed), 0);

          return {
            timestamp: bucketStart * 1000, // Convert to milliseconds for frontend
            value: bucketGasUsed,
          };
        });

      res.json({
        totalGasUsed,
        ethPaid: totalEthPaid,
        avgGasPerTx,
        avgGasPrice,
        chartData,
      });
    })
  );

  // route /leaderboard: Get the leaderboard data for a given market
  app.get(
    '/leaderboard',
    validateRequestParams(['contractId']),
    handleAsyncErrors(async (req, res) => {
      const { contractId } = req.query as { contractId: string };

      const { chainId, address } = parseContractId(contractId);

      const market = await marketRepository.findOne({
        where: { chainId: Number(chainId), address: String(address) },
      });

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      const where = { epoch: { market: { id: market.id } } };

      const positions = await positionRepository.find({
        where,
        order: { positionId: 'ASC' },
      });

      const marketAddress = address;
      const client = getProviderForChain(Number(chainId));

      const calculateOpenPositionValue = async (position: Position) => {
        const collateralValue = await client.readContract({
          address: marketAddress as `0x${string}`,
          abi: [
            {
              type: 'function',
              name: 'getPositionCollateralValue',
              inputs: [
                {
                  name: 'positionId',
                  type: 'uint256',
                  internalType: 'uint256',
                },
              ],
              outputs: [
                {
                  name: 'collateralValue',
                  type: 'uint256',
                  internalType: 'uint256',
                },
              ],
              stateMutability: 'view',
            },
          ],
          functionName: 'getPositionCollateralValue',
          args: [BigInt(position.positionId)],
        });

        return Number(collateralValue);
      };

      const calculateCollateralFlow = async (positions: Position[]) => {
        const transactions = await transactionRepository.find({
          where: {
            position: { positionId: In(positions.map((p) => p.positionId)) },
          },
          relations: ['position', 'collateralTransfer'],
        });

        let collateralFlow = 0;
        let maxCollateral = 0;
        for (const transaction of transactions) {
          if (transaction.collateralTransfer) {
            collateralFlow += Number(transaction.collateralTransfer.collateral);
            maxCollateral = Math.max(maxCollateral, collateralFlow);
          }
        }
        return { collateralFlow, maxCollateral };
      };

      interface GroupedPosition {
        owner: string;
        positions: Position[];
        totalPnL: number;
        totalCollateralFlow: number;
        ownerMaxCollateral: number;
      }

      const groupedByOwner: Record<string, GroupedPosition> = {};
      for (const position of positions) {
        if (!groupedByOwner[position.owner]) {
          groupedByOwner[position.owner] = {
            owner: position.owner,
            positions: [],
            totalPnL: 0,
            totalCollateralFlow: 0,
            ownerMaxCollateral: 0,
          };
        }

        const positionPnL = await calculateOpenPositionValue(position);
        groupedByOwner[position.owner].totalPnL += positionPnL;

        groupedByOwner[position.owner].positions.push(position);
      }

      for (const owner in groupedByOwner) {
        const { collateralFlow, maxCollateral } = await calculateCollateralFlow(
          groupedByOwner[owner].positions
        );
        groupedByOwner[owner].totalPnL -= collateralFlow;
        groupedByOwner[owner].totalCollateralFlow = -collateralFlow;
        groupedByOwner[owner].ownerMaxCollateral = maxCollateral;
      }

      // Convert to array and sort by total PnL
      const sortedPositions = Object.values(groupedByOwner).sort(
        (a, b) => b.totalPnL - a.totalPnL
      );

      res.json(sortedPositions);
    })
  );

  // route /reindexMissingBlocks: Update the reindexMissingBlocks endpoint
  app.post(
    '/reindexMissingBlocks',
    handleAsyncErrors(async (req, res) => {
      const { chainId, address, epochId, signature, timestamp, model } =
        req.body;

      // Authenticate the user
      const isAuthenticated = await isValidWalletSignature(
        signature as `0x${string}`,
        Number(timestamp)
      );
      if (!isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const RENDER_API_KEY = process.env.RENDER_API_KEY;
      if (!RENDER_API_KEY) {
        throw new Error('RENDER_API_KEY not set');
      }

      async function fetchRenderServices() {
        const url = 'https://api.render.com/v1/services?limit=100';
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
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
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RENDER_API_KEY}`,
            'Content-Type': 'application/json',
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

      let id: string = '';
      const renderServices = await fetchRenderServices();
      for (const item of renderServices) {
        if (
          item?.service?.type === 'background_worker' &&
          item?.service?.id &&
          (process.env.NODE_ENV === 'staging'
            ? item?.service?.branch === 'staging'
            : item?.service?.branch === 'main')
        ) {
          id = item?.service.id;
          break;
        }
      }
      if (!id) {
        throw new Error('Background worker not found');
      }

      const startCommand =
        model === 'ResourcePrice'
          ? `pnpm run start:reindex-missing ${chainId} ${address} ${epochId}`
          : `pnpm run start:reindex-market ${chainId} ${address} ${epochId}`;

      if (process.env.NODE_ENV !== 'production') {
        try {
          const result = await executeLocalReindex(startCommand);
          res.json({ success: true, job: result });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
        return;
      }

      const job = await createRenderJob(id, startCommand);

      const jobDb = new RenderJob();
      jobDb.jobId = job.id;
      jobDb.serviceId = job.serviceId;
      await renderJobRepository.save(jobDb);

      res.json({ success: true, job });
    })
  );

  // route /resources: Get resources with their public market epochs
  app.get(
    '/resources',
    handleAsyncErrors(async (req, res) => {
      const resources = await dataSource
        .getRepository(Resource)
        .createQueryBuilder('resource')
        .leftJoinAndSelect('resource.markets', 'market')
        .leftJoinAndSelect('market.epochs', 'epoch')
        .getMany();

      // Format the response to include only necessary data
      const formattedResources = resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        slug: resource.slug,
        markets: (resource.markets || [])
          .filter((market) => market.public)
          .map((market) => ({
            id: market.id,
            address: market.address,
            chainId: market.chainId,
            name: resource.name,
            epochs: market.epochs.map((epoch) => ({
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

  // route /resources/:slug/prices/latest
  app.get(
    '/resources/:slug/prices/latest',
    handleAsyncErrors(async (req, res) => {
      const { slug } = req.params;

      const resourceRepository = dataSource.getRepository(Resource);
      const resource = await resourceRepository.findOne({ where: { slug } });

      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
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

  // route /resources/:slug/prices
  app.get(
    '/resources/:slug/prices',
    handleAsyncErrors(async (req, res) => {
      const { slug } = req.params;
      const { startTime, endTime } = req.query;

      const resourceRepository = dataSource.getRepository(Resource);
      const resource = await resourceRepository.findOne({ where: { slug } });

      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      const resourcePriceRepository = dataSource.getRepository(ResourcePrice);
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

      res.json(prices);
    })
  );

  // Only set up Sentry error handling in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global error handler
  app.use((err: Error, req: Request, res: Response) => {
    console.error('An error occurred:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  const hydrateTransactions = (transactions: Transaction[]) => {
    const hydratedPositions = [];

    // Format data
    let lastPositionId = 0;
    let lastBaseToken = BigInt(0);
    let lastQuoteToken = BigInt(0);
    let lastCollateral = BigInt(0);
    for (const transaction of transactions) {
      transaction.tradeRatioD18 = formatDbBigInt(transaction.tradeRatioD18);

      const hydratedTransaction = {
        ...transaction,
        position: {
          ...transaction.position,
          epoch: {
            ...transaction.position?.epoch,
            market: {
              ...transaction.position?.epoch?.market,
              resource: transaction.position?.epoch?.market?.resource,
            },
          },
        },
        collateralDelta: '0',
        baseTokenDelta: '0',
        quoteTokenDelta: '0',
      };

      // if transactions come from the position.transactions it doesn't have a .position, but all the transactions correspond to the same position
      if (
        transaction.position &&
        transaction.position.positionId !== lastPositionId
      ) {
        lastBaseToken = BigInt(0);
        lastQuoteToken = BigInt(0);
        lastCollateral = BigInt(0);
        lastPositionId = transaction.position.positionId;
      }

      // If the transaction is from a liquidity position, use the lpDeltaToken values
      // Otherwise, use the baseToken and quoteToken values from the previous transaction (trade with history)
      const currentBaseTokenBalance =
        transaction.lpBaseDeltaToken ||
        BigInt(transaction.baseToken) - lastBaseToken;
      const currentQuoteTokenBalance =
        transaction.lpQuoteDeltaToken ||
        BigInt(transaction.quoteToken) - lastQuoteToken;
      const currentCollateralBalance =
        BigInt(transaction.collateral) - lastCollateral;

      hydratedTransaction.baseTokenDelta = formatDbBigInt(
        currentBaseTokenBalance.toString()
      );
      hydratedTransaction.quoteTokenDelta = formatDbBigInt(
        currentQuoteTokenBalance.toString()
      );
      hydratedTransaction.collateralDelta = formatDbBigInt(
        currentCollateralBalance.toString()
      );

      hydratedPositions.push(hydratedTransaction);

      // set up for next transaction
      lastBaseToken = BigInt(transaction.baseToken);
      lastQuoteToken = BigInt(transaction.quoteToken);
      lastCollateral = BigInt(transaction.collateral);
    }
    return hydratedPositions;
  };
};

startServer().catch((e) => console.error('Unable to start server: ', e));
