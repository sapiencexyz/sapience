import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { getMarketAndEpoch } from '../helpers/getMarketAndEpoch';
import { marketRepository, epochRepository } from '../db';

interface Transaction {
  timeStamp: string;
  gasUsed: string;
  gasPrice: string;
}

const router = Router();

router.post(
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

    const transactions: Transaction[] = [];
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
        (tx: Transaction) => Number(tx.timeStamp) >= startTime
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

export { router };
