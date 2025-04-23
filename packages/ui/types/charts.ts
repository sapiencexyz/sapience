export enum ChartType {
  PRICE = 'Price Chart',
  DEPTH = 'Depth',
  ORDER_BOOK = 'Order Book',
  VOLUME = 'VOLUME',
  LIQUIDITY = 'LIQUIDITY',
}

export enum TimeWindow {
  D = 'D',
  W = 'W',
  M = 'M',
}

export enum TimeInterval {
  I5M = 'I5M',
  I15M = 'I15M',
  I30M = 'I30M',
  I4H = 'I4H',
  I1D = 'I1D',
}

// Define the types for the lines that can be selected
export enum LineType {
  MarketPrice = 'marketPrice',
  IndexPrice = 'indexPrice',
  ResourcePrice = 'resourcePrice',
  TrailingAvgPrice = 'trailingAvgPrice',
}
