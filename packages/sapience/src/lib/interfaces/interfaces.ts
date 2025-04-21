// Define CandleType based on schema.graphql
export interface CandleType {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

// Define ResourceType based on schema.graphql (simplified)
export interface ResourceType {
    id: string;
    name: string;
    slug: string;
    // Add other fields if needed, e.g., category, marketGroups, resourcePrices
}

export interface Market {
  id: string;
  marketId: string; // GraphQL schema uses Int!, but often handled as string in JS/TS
  question?: string | null; // Question can be null
  startTimestamp?: number | null; // Make timestamps optional based on schema
  endTimestamp?: number | null;   // Make timestamps optional based on schema
  settled?: boolean | null;
  // Added fields from MarketType schema
  marketGroup?: MarketGroup | null; // Link back to MarketGroup
  positions?: PositionType[] | null; // Requires PositionType definition
  public?: boolean | null;
  settlementPriceD18?: string | null;
}

// Define PositionType (simplified, based on schema)
export interface PositionType {
    id: string;
    positionId: number; // Int! in schema
    owner: string;
    // Add other fields as needed
}

export interface MarketGroup {
  id: string;
  address: string;
  chainId: number;
  question?: string | null; // Question can be null
  markets: Market[];
  placeholder?: boolean; // Keep placeholder for loading/error states
  optionNames?: string[];
  baseTokenName?: string;
  quoteTokenName?: string;
  // Added fields from MarketGroupType schema
  resource?: ResourceType | null; // Added resource field
  category?: CategoryType | null; // Requires CategoryType definition
  claimStatement?: string | null;
  collateralAsset?: string | null;
  collateralDecimals?: number | null;
  deployTimestamp?: number | null;
  deployTxnBlockNumber?: number | null;
  isCumulative?: boolean | null;
  isYin?: boolean | null;
  owner?: string | null;
  vaultAddress?: string | null;
}

// Define CategoryType (simplified, based on schema)
export interface CategoryType {
    id: string;
    name: string;
    slug: string;
}

// It's generally better practice to generate these types from your schema
// using tools like GraphQL Code Generator to ensure they stay in sync.
