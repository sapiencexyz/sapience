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

export type LlmEndTimeConfidence = 'high' | 'low' | 'unknown';

export interface LlmEndTimeResult {
  ts: number | null;
  confidence: LlmEndTimeConfidence;
}

export interface SapienceCondition {
  conditionHash: string; // Polymarket's conditionId - used to resolve via LZ
  question: string;
  shortName: string; // Clear Yes/No-answerable short form (from regex, LLM, or question fallback)
  optionName?: string; // Per-row differentiator inside a group, verbatim from Polymarket groupItemTitle
  categorySlug: SapienceCategorySlug;
  endDate: string;
  description: string;
  similarMarkets: string[]; // Polymarket URLs (slug is in the URL)
  tags: string[]; // Event tags from Polymarket (e.g., "Politics", "Crypto")
  chainId: number; // Chain ID where condition will be deployed (Ethereal: 5064014)
  groupTitle?: string; // Group display name (used for new-group create and as legacy lookup fallback)
  /**
   * Polymarket event id (`events[0].id` on the Gamma /markets response).
   * When set, the admin route looks up the group by
   * (source='polymarket', externalEventId) instead of by name. This is
   * the canonical identity that lets weekly recurring events ("Top US
   * Netflix Movie This Week", "Pacers vs Wizards", etc.) land in fresh
   * groups instead of getting folded by name.
   */
  externalEventId?: string;
  estimatedPrice?: number; // 0-1, YES probability from Polymarket outcomePrices[0]
  similarMarketVolume?: number; // USD total trading volume from Polymarket
  similarMarketImage?: string; // Image URL from Polymarket
  endTimeOverride?: number; // Regex-extracted endTime fallback (unix seconds), only trusted for templated markets
  categoryEndTime?: number; // High-precision category specialist (weather/crypto/sports/social/snapshot) endTime (unix seconds). Top of the cascade; when set, the market also skips Sonar.
  llmEndTime?: LlmEndTimeResult; // Perplexity Sonar result; runs only when categoryEndTime is null
  isTemplated?: boolean; // True for sports/series/group templates; gates regex-fallback in decideEndTime
  negRisk?: boolean; // True when this condition belongs to a Polymarket negative-risk basket
  negRiskMarketId?: string; // Polymarket negative-risk basket identifier
}

export interface SapienceConditionGroup {
  title: string;
  categorySlug: SapienceCategorySlug;
  description: string;
  similarMarkets: string[];
  tags: string[];
  // Polymarket negative-risk basket identifier. When set, every child
  // condition is part of the same mutually-exclusive basket. The API
  // derives `ConditionGroup.negRisk` from this being non-null; the
  // keeper sends only the id.
  negRiskMarketId?: string;
  /**
   * Polymarket event id — the canonical group identity. When the keeper
   * includes this, the admin route looks up by
   * (source='polymarket', externalEventId) instead of by name, so
   * weekly recurring titles get their own fresh groups instead of
   * collapsing.
   */
  externalEventId?: string;
  conditions: SapienceCondition[];
}

/**
 * Fields on a Condition that the generate cron is allowed to keep in sync
 * with fresh Polymarket data. Excludes fields that are owned by other
 * pipelines or are not Polymarket-derived:
 *   - estimatedPrice: owned by the submitPriceUpdates cron (runs on its own cadence)
 *   - categoryId/categorySlug: LLM-derived, set once on create
 *   - public/settled/resolver/chainId: protocol/operator state, not metadata
 *
 * endTime is included so the backfill-endtimes script can correct historical
 * Polymarket markets whose stored endTime drifted from Polymarket's
 * end_date_iso. The batch-metadata API rejects endTime changes on settled
 * rows; the keeper diff respects that and never proposes them.
 */
export interface SyncableFields {
  question?: string;
  shortName?: string;
  optionName?: string;
  description?: string;
  similarMarkets?: string[];
  tags?: string[];
  similarMarketVolume?: number;
  similarMarketImage?: string;
  groupName?: string;
  /**
   * Polymarket event id. When present in a batch-metadata payload, the
   * admin route looks up the group by (source, externalEventId) instead
   * of by name — see packages/api/src/routes/conditions.ts. Going forward
   * this is the canonical identity; groupName is kept as a display value
   * and legacy lookup fallback.
   */
  externalEventId?: string;
  endTime?: number;
}

export interface MetadataUpdate {
  conditionId: string;
  fields: SyncableFields;
  old: SyncableFields;
}

/**
 * Fields on a ConditionGroup that the generate cron is allowed to keep in sync
 * with fresh Polymarket data. Intentionally narrow: name is excluded because
 * group names have a unique constraint, and category is LLM-derived.
 *
 * `negRiskMarketId` carries the basket id. The API derives
 * `ConditionGroup.negRisk` from this column being non-null, so the keeper
 * doesn't need a separate boolean field in the payload.
 */
export interface GroupSyncableFields {
  similarMarkets?: string[];
  negRiskMarketId?: string | null;
}

export interface GroupMetadataUpdate {
  groupId: number;
  fields: GroupSyncableFields;
  old: GroupSyncableFields;
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
}
