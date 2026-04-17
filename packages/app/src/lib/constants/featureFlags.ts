/**
 * Feature flags read from Next.js public environment variables.
 *
 * All committed-intent UI and code paths are gated behind
 * `COMMITTED_INTENT_ENABLED`. See `prd-001-feature-flag.md`.
 */

export const COMMITTED_INTENT_ENABLED: boolean =
  process.env.NEXT_PUBLIC_COMMITTED_INTENT_ENABLED === 'true';

/**
 * Address of the CommittedIntentExecutor contract.
 * Read from env or defaults to zero address (feature disabled / not deployed).
 */
export const COMMITTED_INTENT_EXECUTOR_ADDRESS: `0x${string}` =
  (process.env.NEXT_PUBLIC_COMMITTED_INTENT_EXECUTOR_ADDRESS as
    | `0x${string}`
    | undefined) ?? '0x0000000000000000000000000000000000000000';
