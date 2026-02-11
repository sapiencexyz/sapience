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
  marketSlug?: string;  // Alternative slug field
  url?: string;  // Direct URL from API
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
  }>;
  active: boolean;
  closed: boolean;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  marketGroup?: string;
}
