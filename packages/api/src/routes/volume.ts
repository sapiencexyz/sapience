import { Router, Request, Response } from 'express';
import {
  validateRequestParams,
  handleAsyncErrors,
  parseContractId,
} from '../helpers';
import { TimeWindow } from 'src/interfaces';
import {
  getStartTimestampFromTimeWindow,
  getTransactionsInTimeRange,
  groupTransactionsByTimeWindow,
} from 'src/serviceUtil';
import { formatUnits } from 'viem';

const router = Router();
const TOKEN_PRECISION = 18;

router.get(
  '/volume',
  validateRequestParams(['contractId', 'timeWindow']),
  handleAsyncErrors(async (req: Request, res: Response) => {
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
        volume: group.entities.reduce((sum: number, transaction: any) => {
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

export default router;
