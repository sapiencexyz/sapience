import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';
import {
  conditionalTokensConditionResolver,
  pythConditionResolver,
  manualConditionResolver,
} from '@sapience/sdk/contracts';
import { getProviderForChain } from '../utils/utils';

const router = Router();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Returns all resolver addresses that the condition-settled indexer
 * watches for a given chain. Mirrors the logic in fixtures.ts.
 */
function getResolverAddressesForChain(chainId: number): `0x${string}`[] {
  const addresses: `0x${string}`[] = [];
  const zero = '0x0000000000000000000000000000000000000000';

  if (IS_PRODUCTION) {
    // Production: CT + Pyth resolvers on mainnet
    const ct = conditionalTokensConditionResolver[chainId]?.address;
    if (ct && ct !== zero) addresses.push(ct as `0x${string}`);

    const pyth = pythConditionResolver[chainId]?.address;
    if (pyth && pyth !== zero) addresses.push(pyth as `0x${string}`);
  } else {
    // Non-production: manual resolver on testnet
    const manual = manualConditionResolver[chainId]?.address;
    if (manual && manual !== zero) addresses.push(manual as `0x${string}`);
  }

  return addresses;
}

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SAFE_STRING_RE = /^[a-zA-Z0-9_\-.:x]+$/;

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
          const str = data.toString();
          output += str;
          console.log(str); // Stream to console in real-time
        });

        process.stderr.on('data', (data: Buffer) => {
          const str = data.toString();
          console.error(str); // Stream to console in real-time
          output += `Error: ${str}\n`; // Also capture errors in the output
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

router.post(
  '/accuracy',
  handleAsyncErrors(async (req, res) => {
    const { address, marketId } = req.body;

    if (address && !ETH_ADDRESS_RE.test(address)) {
      res.status(400).json({ error: 'Invalid address format' });
      return;
    }
    if (marketId && !SAFE_STRING_RE.test(String(marketId))) {
      res.status(400).json({ error: 'Invalid marketId format' });
      return;
    }

    const startCommand =
      `pnpm run start:reindex-accuracy ${address || ''} ${marketId || ''}`.trim();

    const params = JSON.stringify({ address, marketId });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: { command: 'reindex-accuracy', status: result.status, params },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: { command: 'reindex-accuracy', status: 'failed', params },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.post(
  '/condition-settled',
  handleAsyncErrors(async (req, res) => {
    const { chainId, startTimestamp, endTimestamp } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    if (
      startTimestamp !== undefined &&
      startTimestamp !== 'undefined' &&
      isNaN(parseInt(startTimestamp))
    ) {
      res.status(400).json({ error: 'startTimestamp must be a number' });
      return;
    }
    if (
      endTimestamp !== undefined &&
      endTimestamp !== 'undefined' &&
      isNaN(parseInt(endTimestamp))
    ) {
      res.status(400).json({ error: 'endTimestamp must be a number' });
      return;
    }

    const resolverAddresses = getResolverAddressesForChain(parsedChainId);
    if (resolverAddresses.length === 0) {
      res.status(400).json({
        error: `No resolver addresses configured for chain ${parsedChainId}`,
      });
      return;
    }

    const params = JSON.stringify({
      chainId: parsedChainId,
      resolverAddresses,
      startTimestamp,
      endTimestamp,
    });

    try {
      const results = [];
      for (const resolverAddress of resolverAddresses) {
        const startCommand = `pnpm run start:reindex-condition-settled ${parsedChainId} ${resolverAddress} ${startTimestamp || 'undefined'} ${endTimestamp || 'undefined'}`;
        results.push(await executeLocalReindex(startCommand));
      }

      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-condition-settled',
          status: 'completed',
          params,
        },
      });
      res.json({ success: true, jobs: results });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-condition-settled',
          status: 'failed',
          params,
        },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.post(
  '/protocol-stats',
  handleAsyncErrors(async (req, res) => {
    const { days, chainId } = req.body;

    const parsedDays = days !== undefined ? parseInt(days) : 90;
    if (isNaN(parsedDays) || parsedDays <= 0) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    if (
      chainId !== undefined &&
      chainId !== 'undefined' &&
      isNaN(parseInt(chainId))
    ) {
      res.status(400).json({ error: 'chainId must be a number' });
      return;
    }

    const startCommand = `pnpm run start:backfill-stats ${parsedDays} ${chainId || 'undefined'}`;

    const params = JSON.stringify({ days: parsedDays, chainId });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: { command: 'backfill-stats', status: result.status, params },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: { command: 'backfill-stats', status: 'failed', params },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.post(
  '/position-balances',
  handleAsyncErrors(async (req, res) => {
    const { chainId, fromBlock, days } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    if (fromBlock !== undefined && isNaN(parseInt(fromBlock))) {
      res.status(400).json({ error: 'fromBlock must be a number' });
      return;
    }
    if (days !== undefined && (isNaN(parseInt(days)) || parseInt(days) <= 0)) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }

    // Resolve fromBlock: explicit fromBlock > days-based binary search > omit (let job decide)
    let resolvedFromBlock: number | undefined = fromBlock
      ? parseInt(fromBlock)
      : undefined;

    if (!resolvedFromBlock && days) {
      const client = getProviderForChain(parsedChainId);
      const targetTimestamp = BigInt(
        Math.floor(Date.now() / 1000) - parseInt(days) * 86400
      );
      const currentBlock = await client.getBlockNumber();

      // Binary search for the block closest to targetTimestamp
      let lo = 0n;
      let hi = currentBlock;
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        const block = await client.getBlock({ blockNumber: mid });
        if (block.timestamp < targetTimestamp) {
          lo = mid + 1n;
        } else {
          hi = mid;
        }
      }
      resolvedFromBlock = Number(lo);
      console.log(
        `[reindex/position-balances] Resolved ${days} days ago to block ${resolvedFromBlock}`
      );
    }

    const startCommand =
      `pnpm run start:reindex-transfers ${parsedChainId} ${resolvedFromBlock || ''}`.trim();

    const params = JSON.stringify({
      chainId: parsedChainId,
      fromBlock: resolvedFromBlock,
      days: days ? parseInt(days) : undefined,
    });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-transfers',
          status: result.status,
          params,
        },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: { command: 'reindex-transfers', status: 'failed', params },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

router.post(
  '/collateral-transfers',
  handleAsyncErrors(async (req, res) => {
    const { chainId, fromBlock } = req.body;

    const parsedChainId = parseInt(chainId);
    if (!chainId || isNaN(parsedChainId)) {
      res.status(400).json({ error: 'Valid chainId is required' });
      return;
    }
    const parsedFromBlock =
      fromBlock !== undefined ? parseInt(fromBlock) : undefined;
    if (parsedFromBlock !== undefined && isNaN(parsedFromBlock)) {
      res.status(400).json({ error: 'fromBlock must be a number' });
      return;
    }

    const startCommand =
      `pnpm run start:reindex-collateral-transfers ${parsedChainId} ${parsedFromBlock ?? ''}`.trim();

    const params = JSON.stringify({
      chainId: parsedChainId,
      fromBlock: parsedFromBlock,
    });
    try {
      const result = await executeLocalReindex(startCommand);
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-collateral-transfers',
          status: result.status,
          params,
        },
      });
      res.json({ success: true, job: result });
    } catch (error: unknown) {
      await prisma.backgroundJob.create({
        data: {
          command: 'reindex-collateral-transfers',
          status: 'failed',
          params,
        },
      });
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unknown error occurred' });
      }
    }
  })
);

export { router };
