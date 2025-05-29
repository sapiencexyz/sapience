import { PriceDatapoint, ResourceHistory } from './types';

export class TrailingAvgHistoryStore {
  private history: Map<
    string, // resourceSlug
    ResourceHistory
  > = new Map();

  isEmpty(): boolean {
    return this.history.size === 0;
  }

  // Add a new price datapoint for a resource and update sums for all trailing avg windows
  addPrice(
    resourceSlug: string,
    price: PriceDatapoint,
    trailingAvgWindowsTimes: number[]
  ) {
    let resourceHistory = this.history.get(resourceSlug);

    if (!resourceHistory) {
      resourceHistory = {
        prices: [],
        pointers: new Map(),
        sums: new Map(),
      };
      this.history.set(resourceSlug, resourceHistory);
    }

    // Add the new price
    resourceHistory.prices.push(price);

    for (const trailingAvgWindowTime of trailingAvgWindowsTimes) {
      // Initialize sums if they don't exist
      if (!resourceHistory.sums.has(trailingAvgWindowTime)) {
        resourceHistory.sums.set(trailingAvgWindowTime, {
          sumUsed: 0n,
          sumFeePaid: 0n,
          startOfTrailingWindow: price.timestamp,
        });
      }

      // Get current sums
      const sums = resourceHistory.sums.get(trailingAvgWindowTime)!;

      sums.sumUsed += BigInt(price.used);
      sums.sumFeePaid += BigInt(price.fee);

      // Update pointer and remove old values
      const cutoffTime = Math.max(0, price.timestamp - trailingAvgWindowTime);
      let pointer = resourceHistory.pointers.get(trailingAvgWindowTime) || 0;
      let deducted = false;

      // Remove old values that are before the cutoff time
      while (
        pointer < resourceHistory.prices.length &&
        resourceHistory.prices[pointer].timestamp <= cutoffTime
      ) {
        const oldPrice = resourceHistory.prices[pointer];
        sums.sumUsed -= BigInt(oldPrice.used);
        sums.sumFeePaid -= BigInt(oldPrice.fee);
        deducted = true;
        pointer++;
      }
      if (pointer > 0 ) {
        // return the pointer to the previous price since we moved it forward inside the loop before the condition
        pointer--;
      }

      // If we have a price after the cutoff time, update the start of the trailing window
      sums.startOfTrailingWindow = resourceHistory.prices[pointer].timestamp;

      // Update pointer
      if (deducted) {
        resourceHistory.pointers.set(trailingAvgWindowTime, pointer+1);
      }
    }

    // Clean up old prices that are no longer needed
    this.cleanupOldPrices(resourceHistory);
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

  private cleanupOldPrices(resourceHistory: ResourceHistory): void {
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
        trailingAvgWindowTime,
        pointer,
      ] of resourceHistory.pointers.entries()) {
        resourceHistory.pointers.set(
          trailingAvgWindowTime,
          pointer - earliestPointer
        );
      }
    }
  }

  public async cleanAll() {
    this.history.clear();
  }
}
