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
  conditionHash: string;  // Polymarket's conditionId - used to resolve via LZ
  question: string;
  shortName: string;  // Short display name (using question since Polymarket doesn't provide one)
  categorySlug: SapienceCategorySlug;
  endDate: string;
  description: string;
  similarMarkets: string[];  // Polymarket URLs (slug is in the URL)
  chainId: number;  // Chain ID where condition will be deployed (Ethereal: 5064014)
  groupTitle?: string;  // Group title for API submission (API will find-or-create group by name)
}

export interface SapienceConditionGroup {
  title: string;
  categorySlug: SapienceCategorySlug;
  description: string;
  similarMarkets: string[];
  conditions: SapienceCondition[];
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
