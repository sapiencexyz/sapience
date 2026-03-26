/**
 * LLM enrichment types
 */

import type { SapienceCategorySlug } from '../types';

export interface MarketEnrichmentInput {
  conditionId: string;
  question: string;
  description: string;
  slug: string;
  eventTitle?: string;
  outcomes: string[];
}

export interface MarketEnrichmentOutput {
  conditionId: string;
  category: SapienceCategorySlug;
  shortName: string;
}

export interface CategoryOutput {
  conditionId: string;
  category: SapienceCategorySlug;
}

export interface ShortNameOnlyOutput {
  conditionId: string;
  shortName: string;
}

export interface EnrichmentResult {
  results: Map<string, MarketEnrichmentOutput>;
  errors: string[];
  usedFallback: boolean;
}

export interface EndTimeEnrichmentInput {
  conditionId: string;
  question: string;
  description: string;
  eventTitle?: string;
}

export interface EndTimeOutput {
  conditionId: string;
  /** Unix timestamp in seconds, or null if LLM cannot determine */
  endTime: number | null;
}
