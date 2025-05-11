import { PriceDatapoint } from './types';

export class TrailingAvgHistoryStore {
  private history: Map<string, {
    prices: PriceDatapoint[];
    pointers: Map<number, number>; // trailingAvgTime -> index in prices array
  }> = new Map();

  // Add a new price datapoint for a resource
  addPrice(resourceSlug: string, price: PriceDatapoint): void {
    let resourceHistory = this.history.get(resourceSlug);
    
    if (!resourceHistory) {
      resourceHistory = {
        prices: [],
        pointers: new Map()
      };
      this.history.set(resourceSlug, resourceHistory);
    }

    // Add the new price
    resourceHistory.prices.push(price);

    // Update pointers for each trailing average period
    this.updatePointers(resourceSlug, price.timestamp);
  }

  // Get all prices for a resource
  getPrices(resourceSlug: string): PriceDatapoint[] {
    return this.history.get(resourceSlug)?.prices || [];
  }

  // Get prices for a specific trailing average period
  getPricesForTrailingAvg(resourceSlug: string, trailingAvgTime: number): PriceDatapoint[] {
    const resourceHistory = this.history.get(resourceSlug);
    if (!resourceHistory) {
      return [];
    }

    const startIndex = resourceHistory.pointers.get(trailingAvgTime);
    if (startIndex === undefined) {
      return [];
    }

    return resourceHistory.prices.slice(startIndex);
  }

  // Get the pointer for a specific trailing average period
  getPointer(resourceSlug: string, trailingAvgTime: number): number | undefined {
    return this.history.get(resourceSlug)?.pointers.get(trailingAvgTime);
  }

  // Check if a resource has history
  hasHistory(resourceSlug: string): boolean {
    return this.history.has(resourceSlug);
  }

  // Get all resource slugs that have history
  getAllResourceSlugs(): string[] {
    return Array.from(this.history.keys());
  }

  // Clear history for a resource
  clearHistory(resourceSlug: string): void {
    this.history.delete(resourceSlug);
  }

  // Clear all history
  clearAllHistory(): void {
    this.history.clear();
  }

  private updatePointers(resourceSlug: string, currentTimestamp: number): void {
    const resourceHistory = this.history.get(resourceSlug);
    if (!resourceHistory) {
      return;
    }

    // Update pointers for each trailing average period
    for (const trailingAvgTime of [7, 28]) { // Hardcoded for now, could be made configurable
      const cutoffTime = currentTimestamp - (trailingAvgTime * 24 * 60 * 60 * 1000); // Convert days to milliseconds
      
      // Find the first price that's still within the trailing period
      let newPointer = resourceHistory.pointers.get(trailingAvgTime) || 0;
      while (newPointer < resourceHistory.prices.length && 
             resourceHistory.prices[newPointer].timestamp < cutoffTime) {
        newPointer++;
      }
      
      resourceHistory.pointers.set(trailingAvgTime, newPointer);
    }

    // Clean up old prices that are no longer needed
    this.cleanupOldPrices(resourceSlug);
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

    // If we have prices before the earliest pointer, remove them
    if (earliestPointer > 0) {
      resourceHistory.prices = resourceHistory.prices.slice(earliestPointer);
      
      // Adjust all pointers
      for (const [trailingAvgTime, pointer] of resourceHistory.pointers.entries()) {
        resourceHistory.pointers.set(trailingAvgTime, pointer - earliestPointer);
      }
    }
  }
} 