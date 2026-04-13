/**
 * Sapience API types
 */

export type SapienceCategorySlug =
  | 'crypto'
  | 'weather'
  | 'tech-science'
  | 'geopolitics'
  | 'economy-finance'
  | 'sports'
  | 'culture'
  | 'unknown';

export interface SapienceCondition {
  conditionHash: string; // Polymarket's conditionId - used to resolve via LZ
  question: string;
  shortName: string; // Short display name (from Polymarket groupItemTitle, regex, LLM, or question fallback)
  categorySlug: SapienceCategorySlug;
  endDate: string;
  description: string;
  similarMarkets: string[]; // Polymarket URLs (slug is in the URL)
  tags: string[]; // Event tags from Polymarket (e.g., "Politics", "Crypto")
  chainId: number; // Chain ID where condition will be deployed (Ethereal: 5064014)
  groupTitle?: string; // Group title for API submission (API will find-or-create group by name)
  estimatedPrice?: number; // 0-1, YES probability from Polymarket outcomePrices[0]
  similarMarketVolume?: number; // USD total trading volume from Polymarket
  similarMarketImage?: string; // Image URL from Polymarket
  endTimeOverride?: number; // LLM-determined endTime (unix seconds, no buffer)
}

export interface SapienceConditionGroup {
  title: string;
  categorySlug: SapienceCategorySlug;
  description: string;
  similarMarkets: string[];
  tags: string[];
  conditions: SapienceCondition[];
}

/**
 * Fields on a Condition that the generate cron is allowed to keep in sync
 * with fresh Polymarket data. Excludes fields that are owned by other
 * pipelines or are not Polymarket-derived:
 *   - endTime: owned by the relist pipeline; settled conditions reject changes
 *   - estimatedPrice: owned by the submitPriceUpdates cron (runs on its own cadence)
 *   - categoryId/categorySlug: LLM-derived, set once on create
 *   - public/settled/resolver/chainId: protocol/operator state, not metadata
 */
export interface SyncableFields {
  question?: string;
  shortName?: string;
  description?: string;
  similarMarkets?: string[];
  tags?: string[];
  similarMarketVolume?: number;
  similarMarketImage?: string;
  groupName?: string;
}

export interface MetadataUpdate {
  conditionId: string;
  fields: SyncableFields;
  old: SyncableFields;
}

export interface SapienceOutput {
  metadata: {
    generatedAt: string;
    source: string;
    totalConditions: number;
    totalGroups: number;
    binaryConditions: number;
  };
  groups: SapienceConditionGroup[];
  ungroupedConditions: SapienceCondition[];
  metadataUpdates: MetadataUpdate[];
}
