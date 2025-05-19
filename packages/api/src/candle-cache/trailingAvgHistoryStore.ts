import { PriceDatapoint } from './types';

export class TrailingAvgHistoryStore {
  private history: Map<
    string,
    {
      prices: PriceDatapoint[];
      pointers: Map<number, number>; // trailingAvgTime -> index in prices array
      sums: Map<
        number,
        { sumUsed: bigint; sumFeePaid: bigint; startOfTrailingWindow: number }
      >; // trailingAvgTime -> sums
    }
  > = new Map();

  isEmpty(): boolean {
    return this.history.size === 0;
  }

  // Add a new price datapoint for a resource and get updated sums
  addPriceAndGetSums(
    resourceSlug: string,
    trailingAvgTime: number,
    price: PriceDatapoint
  ): { sumUsed: bigint; sumFeePaid: bigint } {
    let resourceHistory = this.history.get(resourceSlug);

    if (!resourceHistory) {
      resourceHistory = {
        prices: [],
        pointers: new Map(),
        sums: new Map(),
      };
      this.history.set(resourceSlug, resourceHistory);
    }

    // Initialize sums if they don't exist
    if (!resourceHistory.sums.has(trailingAvgTime)) {
      resourceHistory.sums.set(trailingAvgTime, {
        sumUsed: 0n,
        sumFeePaid: 0n,
        startOfTrailingWindow: price.timestamp,
      });
    }

    // Get current sums
    const sums = resourceHistory.sums.get(trailingAvgTime)!;

    // Add the new price
    resourceHistory.prices.push(price);
    sums.sumUsed += BigInt(price.used);
    sums.sumFeePaid += BigInt(price.fee);

    // Update pointer and remove old values
    const cutoffTime = price.timestamp - trailingAvgTime;
    let pointer = resourceHistory.pointers.get(trailingAvgTime) || 0;

    // Remove old values that are before the cutoff time
    while (
      pointer < resourceHistory.prices.length &&
      resourceHistory.prices[pointer].timestamp < cutoffTime
    ) {
      const oldPrice = resourceHistory.prices[pointer];
      sums.sumUsed -= BigInt(oldPrice.used);
      sums.sumFeePaid -= BigInt(oldPrice.fee);
      sums.startOfTrailingWindow = oldPrice.timestamp;
      pointer++;
    }
    // If we have a price after the cutoff time, update the start of the trailing window
    if (pointer < resourceHistory.prices.length) {
      sums.startOfTrailingWindow = resourceHistory.prices[pointer].timestamp;
    }

    // Update pointer
    resourceHistory.pointers.set(trailingAvgTime, pointer);

    // Clean up old prices that are no longer needed
    this.cleanupOldPrices(resourceSlug);

    return sums;
  }

  // Get the sums for a resource and trailing average time
  getSums(
    resourceSlug: string,
    trailingAvgTime: number
  ): { sumUsed: bigint; sumFeePaid: bigint; startOfTrailingWindow: number } {
    const resourceHistory = this.history.get(resourceSlug);
    if (!resourceHistory) {
      return { sumUsed: 0n, sumFeePaid: 0n, startOfTrailingWindow: 0 };
    }

    const sums = resourceHistory.sums.get(trailingAvgTime);
    if (!sums) {
      return { sumUsed: 0n, sumFeePaid: 0n, startOfTrailingWindow: 0 };
    }
    return sums;
  }

  private cleanupOldPrices(resourceSlug: string): void {
    const resourceHistory = this.history.get(resourceSlug);
    if (!resourceHistory) {
      return;
    }

    // Find the earliest pointer
    let earliestPointer = resourceHistory.prices.length;
    for (const pointer of resourceHistory.pointers.values()) {
      earliestPointer = Math.min(earliestPointer, pointer);
    }

    // Only clean up if we have more than 100_000 unused items
    if (earliestPointer > 100_000) {
      resourceHistory.prices = resourceHistory.prices.slice(earliestPointer);

      // Adjust all pointers
      for (const [
        trailingAvgTime,
        pointer,
      ] of resourceHistory.pointers.entries()) {
        resourceHistory.pointers.set(
          trailingAvgTime,
          pointer - earliestPointer
        );
      }
    }
  }
}
