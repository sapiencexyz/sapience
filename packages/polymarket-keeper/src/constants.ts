/**
 * Configuration constants
 */

// Admin authentication message (used for signing admin API requests)
export const ADMIN_AUTHENTICATE_MSG = 'Sign this message to authenticate for admin actions.';

// Placeholder resolver address - update this with actual resolver contract address
export const RESOLVER_ADDRESS = '0xdC1Fa830aD1de01f1EF603749f48bD73384286BE' as const;

export const DEFAULT_SAPIENCE_API_URL = 'https://api.sapience.xyz';

// Ethereal chain ID (from @sapience/sdk/constants/chain.ts)
export const CHAIN_ID_ETHEREAL = 5064014 as const;

// Minimum volume threshold (in USD) for including markets
export const MIN_VOLUME_THRESHOLD = 50_000;

// Minimum liquidity threshold (in USD) for including markets
export const MIN_LIQUIDITY_THRESHOLD = 1_000;

// Markets matching these patterns are always included regardless of volume
export const ALWAYS_INCLUDE_PATTERNS = [
  /\bfed\b/i,                                    // Federal Reserve
  /\bfederal reserve\b/i,                        // Federal Reserve (explicit)
  /\bs&p 500\b/i,                                // S&P 500
  /\bspx\b/i,                                    // S&P 500 (ticker)
  /price of Bitcoin.+on \w+ \d+/i,               // "Will the price of Bitcoin be... on January 28?"
  /price of Ethereum.+on \w+ \d+/i,              // "Will the price of Ethereum be above... on January 28?"
];

// LLM Configuration
export const LLM_ENABLED = process.env.LLM_ENABLED === 'true';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
// set LLM_MODEL env var to use paid models like 'openai/gpt-4o-mini'
// FFR: try mistralai/ministral-3b or other cheaper alternatives to gpt-4o-mini
export const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
