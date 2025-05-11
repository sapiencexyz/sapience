import { ResponseCandleData } from "./types";
import { CANDLE_CACHE_CONFIG } from "./config";

export class CandleCacheRetrieve {
  private static instance: CandleCacheRetrieve;

  private config: typeof CANDLE_CACHE_CONFIG;

  private marketGroupIds: string[] = [];
  private marketIds: string[] = [];
  private resourceIds: string[] = [];
  private constructor() {
    this.config = CANDLE_CACHE_CONFIG;
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheRetrieve();
    }
    return this.instance;
  }

  getResourcePrices(resourceId: string, from: number, to: number, interval: number) {
    this.checkInterval(interval);

    return this.pullAndFillCandles({
      resourceId,
      interval,
      type: 'resource',
      from,
      to,
    });
  }

  getIndexPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    epoch: string
  ) {
    this.checkInterval(interval);
    // TODO: get the market id and check if it's cumulative
    let isCumulative = false;
    let marketId = '';


    return this.pullAndFillCandles({
      interval,
      type: 'index',
      from,
      to,
      isCumulative,
      marketId,
    });
  }

  getTrailingAvgPrices(
    from: number,
    to: number,
    interval: number,
    trailingAvgTime: number
  ) {
    this.checkInterval(interval);
    // TODO: get the market id
    let marketId = '';
    const type = `trailingAvg-${trailingAvgTime}`;

    return this.pullAndFillCandles({
      interval,
      type,
      from,
      to,
      marketId,
    });
  }

  async getMarketPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    epoch: string
  ) {
    this.checkInterval(interval);
    // TODO: get the market id
    let marketId = '';

    return this.pullAndFillCandles({
      interval,
      type: 'market',
      from,
      to,
      marketId,
      fillMissingCandles: true,
    });
  }

  private checkInterval(interval: number) {
    if (!this.config.intervals.includes(interval)) {
      throw new Error(
        `Invalid interval: ${interval}. Must be one of: ${this.config.intervals.join(', ')}`
      );
    }
  }

  private async pullAndFillCandles(params:{
    from: number;
    to: number;
    interval: number;
    type: string;
    resourceId?: string;
    isCumulative?: boolean;
    marketId?: string;
    fillMissingCandles?: boolean;
  }
  ): Promise<ResponseCandleData[]> {
    return [];
  }

}
