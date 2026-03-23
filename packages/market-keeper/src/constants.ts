import {
  manualConditionResolver,
  conditionalTokensConditionResolver,
} from '@sapience/sdk';

/**
 * Configuration constants
 */

// Admin authentication message (used for signing admin API requests)
export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

// Environment mode
const isProduction = process.env.NODE_ENV === 'production';

// Chain ID — configurable via env var, defaults to Ethereal mainnet
export const CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

// Resolver address — configurable via env var
// Production: ConditionalTokensConditionResolver (LZ bridging from Polygon)
// Staging: ManualConditionResolver (direct admin settlement)
export const RESOLVER_ADDRESS = (process.env.RESOLVER_ADDRESS ||
  (isProduction
    ? conditionalTokensConditionResolver[CHAIN_ID]?.address
    : manualConditionResolver[CHAIN_ID]?.address) ||
  '') as `0x${string}`;

export const DEFAULT_SAPIENCE_API_URL = 'https://api.sapience.xyz';

// Maximum end date window (in days) for fetching markets
export const MAX_END_DATE_DAYS = 21;

// Minimum volume threshold (in USD) for including markets
export const MIN_VOLUME_THRESHOLD = 10_000;

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
];

// Relist configuration
export const RELIST_LOOKBACK_DAYS = 30;
export const RELIST_FORWARD_DAYS = 3;

// End time buffer: added to Polymarket's endDate to cover UMA 2h liveness period
export const END_TIME_BUFFER_HOURS = 4;
export const END_TIME_BUFFER_SECONDS = END_TIME_BUFFER_HOURS * 3600;

// LLM Configuration
export const LLM_ENABLED = process.env.LLM_ENABLED === 'true';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
// set LLM_MODEL env var to use paid models like 'openai/gpt-4o-mini'
// FFR: try mistralai/ministral-3b or other cheaper alternatives to gpt-4o-mini
export const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
