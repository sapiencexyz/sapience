import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';
import { getResolverConfig, type ResolverType } from './resolver';

/**
 * Configuration constants
 */

// Admin authentication message (used for signing admin API requests)
export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

// Chain ID — configurable via env var, defaults to Ethereal mainnet
export const CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

// Resolver type — derived from chain ID:
//   Testnet (13374202) → 'manual' (ManualConditionResolver, direct admin settlement)
//   Everything else    → 'ct'     (ConditionalTokensConditionResolver, LZ bridge from Polygon)
export const RESOLVER_TYPE: ResolverType =
  CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET ? 'manual' : 'ct';

const resolverConfig = getResolverConfig(CHAIN_ID, RESOLVER_TYPE);

// Primary resolver address for creating new conditions
export const RESOLVER_ADDRESS = resolverConfig.address;

// All resolver addresses (current + legacy) for this chain, lowercased for DB matching.
// Used to filter Polymarket-sourced conditions for price refresh queries.
export const ALL_POLYMARKET_RESOLVER_ADDRESSES: string[] =
  resolverConfig.allAddresses;

export const DEFAULT_SAPIENCE_API_URL = 'https://api.sapience.xyz';

// Maximum end date window (in days) for fetching markets
export const MAX_END_DATE_DAYS = 21;

// Minimum volume threshold (in USD) for including markets
export const MIN_VOLUME_THRESHOLD = 1_000;

// Minimum liquidity threshold (in USD) for including markets
export const MIN_LIQUIDITY_THRESHOLD = 1_000;

// Markets matching these patterns are always included regardless of volume
export const ALWAYS_INCLUDE_PATTERNS = [
  /\bfed\b/i, // Federal Reserve
  /\bfederal reserve\b/i, // Federal Reserve (explicit)
  /\bs&p 500\b/i, // S&P 500
  /\bspx\b/i, // S&P 500 (ticker)
  /price of Bitcoin.+on \w+ \d+/i, // "Will the price of Bitcoin be... on January 28?"
  /price of Ethereum.+on \w+ \d+/i, // "Will the price of Ethereum be above... on January 28?"
  /\bMaine\b/i, // Maine
  /\bMichigan\b/i, // Michigan
];

// Supplementary event tag slugs to fetch from /events endpoint
// added this for other market tags we are not fetching from the markets endpoint.
// We add the tags here and we can fetch them.
export const SUPPLEMENTARY_EVENT_TAGS = ['earnings'];

// Relist configuration
export const RELIST_LOOKBACK_DAYS = 30;
export const RELIST_FORWARD_DAYS = 3;

// LLM Configuration
export const LLM_ENABLED = process.env.LLM_ENABLED === 'true';
// Sub-flags: both default ON when LLM_ENABLED=true; set to 'false' to disable individually
export const LLM_ENRICHMENT_ENABLED =
  LLM_ENABLED && process.env.LLM_ENRICHMENT_ENABLED !== 'false';
export const LLM_ENDTIME_SEARCH_ENABLED =
  LLM_ENABLED && process.env.LLM_ENDTIME_SEARCH_ENABLED !== 'false';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
// set LLM_MODEL env var to use paid models like 'openai/gpt-4o-mini'
// FFR: try mistralai/ministral-3b or other cheaper alternatives to gpt-4o-mini
export const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';

// Perplexity Sonar model for web-search-augmented endTime determination.
//
// Defaults to `perplexity/sonar-pro`. We compared sonar vs sonar-pro
// head-to-head on the same 27-market UEFA backfill with identical prompt:
//   - basic sonar: produced 1 catastrophic hallucination (2026-10-29 for
//     a UECL market whose final is 2026-05-27 — off by 154 days, citations
//     were correct UECL pages, no signal that it was guessing). 20/27 were
//     stamped EOD fallback rather than kickoff+duration.
//   - sonar-pro: zero hallucinations. 19/27 high-confidence with actual
//     kickoff+duration timestamps (21:00/21:15/21:30/21:45).
// The 5× cost (~$0.10 vs $0.02 per 27 markets) buys both correctness and
// the ability to detect when the model is guessing. Override via
// LLM_ENDTIME_MODEL=perplexity/sonar if cost dominates at scale.
// Costs: sonar $1/M in + $1/M out + $5/1000 searches;
//        sonar-pro $3/M in + $15/M out + $5/1000 searches.
export const LLM_ENDTIME_MODEL =
  process.env.LLM_ENDTIME_MODEL || 'perplexity/sonar-pro';
// Longer timeout for Sonar (does web searches)
export const LLM_ENDTIME_TIMEOUT_MS = 60000;
