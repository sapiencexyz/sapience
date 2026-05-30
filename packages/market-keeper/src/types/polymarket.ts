/**
 * Polymarket API types
 */

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  outcomes: string[] | string;
  volume: string;
  liquidity: string;
  endDate: string;
  description: string;
  slug: string;
  marketSlug?: string; // Alternative slug field
  url?: string; // Direct URL from API
  category?: string;
  questionID?: string;
  sportsMarketType?: string;
  events?: Array<{
    id?: string;
    title?: string;
    slug?: string;
    description?: string;
    seriesSlug?: string;
    series?: Array<{
      slug?: string;
      ticker?: string;
      title?: string;
    }>;
    tags?: Array<{
      label?: string;
      slug?: string;
    }>;
    negRisk?: boolean;
    negRiskMarketId?: string | number;
    negRiskMarketID?: string | number;
    neg_risk_market_id?: string | number;
  }>;
  outcomePrices?: string | number[];
  // True on every child of a Polymarket "negative risk" basket — a set of
  // mutually-exclusive binary markets where exactly one resolves YES and the
  // rest resolve NO. The basket is one logical question, so admission
  // decisions must apply to every sibling together, not per child.
  negRisk?: boolean;
  negRiskMarketId?: string | number;
  negRiskMarketID?: string | number;
  neg_risk_market_id?: string | number;
  active: boolean;
  closed: boolean;
  archived?: boolean;
  image?: string;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  marketGroup?: string;
}
