import { ONE_DAY_MS, ONE_HOUR_MS, ONE_MINUTE_MS } from "../constants";
import dataSource from "../db";
import { Transaction } from "../entity/Transaction";
import { VolumeWindow } from "../interfaces/interfaces";

export interface TransactionGroup {
  startTimestamp: number;
  endTimestamp: number;
  transactions: Transaction[];
}

export async function getTransactionsInTimeRange(
  startTimestamp: number,
  endTimestamp: number,
  chainId: string,
  marketAddress: string
): Promise<Transaction[]> {
  const transactionRepository = dataSource.getRepository(Transaction);
  return await transactionRepository
    .createQueryBuilder("transaction")
    .innerJoinAndSelect("transaction.event", "event")
    .innerJoin("event.epoch", "epoch")
    .innerJoin("epoch.market", "market")
    .leftJoinAndSelect("transaction.marketPrice", "marketPrice")
    .leftJoinAndSelect("transaction.position", "position")
    .where(
      "CAST(event.timestamp AS BIGINT) BETWEEN :startTimestamp AND :endTimestamp",
      {
        startTimestamp,
        endTimestamp,
      }
    )
    .andWhere("market.chainId = :chainId", { chainId })
    .andWhere("market.address = :marketAddress", { marketAddress })
    .orderBy("CAST(event.timestamp AS BIGINT)", "ASC")
    .getMany();
}

export function groupTransactionsByTimeWindow(
  transactions: Transaction[],
  window: VolumeWindow
): TransactionGroup[] {
  const now = Date.now();
  let intervalMs: number;
  let totalIntervals: number;
  let startTime: number;

  switch (window) {
    case VolumeWindow.Y:
      intervalMs = ONE_DAY_MS * 7;
      totalIntervals = 52; // 52 weeks
      startTime = now - 365 * ONE_DAY_MS;
      break;
    case VolumeWindow.M:
      intervalMs = ONE_DAY_MS;
      totalIntervals = 30;
      startTime = now - 30 * ONE_DAY_MS;
      break;
    case VolumeWindow.W:
      intervalMs = 6 * ONE_HOUR_MS; // get intervals of every 6 hours for a week
      totalIntervals = 28; // (i.e. 7 days * 4 interval/day)
      startTime = now - 7 * ONE_DAY_MS;
      break;
    case VolumeWindow.D:
      intervalMs = ONE_HOUR_MS;
      totalIntervals = 24;
      startTime = now - ONE_DAY_MS;
      break;
    case VolumeWindow.H:
      intervalMs = 5 * ONE_MINUTE_MS;
      totalIntervals = 12;
      startTime = now - ONE_HOUR_MS;
      break;
    default:
      throw new Error("Invalid volume window");
  }

  // Initialize result array
  const result: TransactionGroup[] = Array(totalIntervals)
    .fill(null)
    .map((_, index) => ({
      startTimestamp: now - (totalIntervals - index) * intervalMs,
      endTimestamp: now - (totalIntervals - index - 1) * intervalMs,
      transactions: [],
    }));

  console.log(
    "First interval:",
    new Date(result[0].startTimestamp),
    "to",
    new Date(result[0].endTimestamp)
  );
  console.log(
    "Last interval:",
    new Date(result[result.length - 1].startTimestamp),
    "to",
    new Date(result[result.length - 1].endTimestamp)
  );

  // Iterate over sorted transactions and group them by time window
  transactions.forEach((transaction, index) => {
    const timestamp = Number(transaction.event.timestamp) * 1000; // Convert to milliseconds

    if (timestamp >= startTime && timestamp <= now) {
      // const intervalIndex = Math.floor((now - timestamp) / intervalMs);
      const intervalIndex = Math.min(
        Math.floor((timestamp - startTime) / intervalMs),
        totalIntervals - 1
      );

      if (intervalIndex >= 0) {
        result[intervalIndex].transactions.push(transaction);
      }
    }
  });

  return result;
}

export function getStartTimestampFromVolumeWindow(window: VolumeWindow) {
  const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds

  const hourInSeconds = 3600;
  const dayInSeconds = 24 * hourInSeconds;
  const weekInSeconds = 7 * dayInSeconds;
  if (window === VolumeWindow.H) {
    return now - hourInSeconds;
  }
  if (window === VolumeWindow.D) {
    return now - dayInSeconds;
  }
  if (window === VolumeWindow.W) {
    return now - weekInSeconds;
  }
  if (window === VolumeWindow.M) {
    return now - 30 * dayInSeconds;
  }
  //else, window === VolumeWindow.Y
  return now - 365 * dayInSeconds;
}
