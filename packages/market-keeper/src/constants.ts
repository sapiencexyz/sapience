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

// End time buffer: added to Polymarket's endDate to cover UMA 2h liveness period
export const END_TIME_BUFFER_HOURS = 4;
export const END_TIME_BUFFER_SECONDS = END_TIME_BUFFER_HOURS * 3600;

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

// Perplexity Sonar model for web-search-augmented endTime determination
export const LLM_ENDTIME_MODEL =
  process.env.LLM_ENDTIME_MODEL || 'perplexity/sonar';
// Longer timeout for Sonar (does web searches)
export const LLM_ENDTIME_TIMEOUT_MS = 60000;
