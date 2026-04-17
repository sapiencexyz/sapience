/**
 * Committed-Intent Types for Relayer
 *
 * Re-exports the SDK types as relayer-local aliases for ergonomics.
 * No schema changes — the SDK module is the source of truth.
 *
 * Canonical reference: `prd-001-spec-0.1-canonical.md` §3, §4.
 */

// Runtime + JSON types from SDK
export type {
  Commitment,
  Quote,
  CommitmentJson,
  QuoteJson,
  SignedCommitmentJson,
  SignedQuoteJson,
  QuoteCancelJson,
} from '@sapience/sdk/types/committedIntent';

export {
  commitmentFromJson,
  commitmentToJson,
  quoteFromJson,
  quoteToJson,
} from '@sapience/sdk/types/committedIntent';

// WebSocket wire protocol types from SDK
export type {
  CommittedIntentClientMessage,
  CommittedIntentServerMessage,
  CommitmentBroadcast,
  QuoteBroadcast,
  ExecutionBroadcast,
  ExecutionSliceBroadcast,
  CommitmentExpiredBroadcast,
  SlashBroadcast,
  CommitmentAckPayload,
  QuoteAckPayload,
  CommitmentSubscribePayload,
  QuoteCancelPayload,
} from '@sapience/sdk/relayer/committedIntentMessages';

// Type guard for committed-intent client messages
export function isCommittedIntentClientMessage(
  msg: unknown
): msg is import('@sapience/sdk/relayer/committedIntentMessages').CommittedIntentClientMessage {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  if (typeof msgObj.type !== 'string') return false;
  return (
    msgObj.type === 'commitment.submit' ||
    msgObj.type === 'commitment.subscribe' ||
    msgObj.type === 'commitment.unsubscribe' ||
    msgObj.type === 'quote.submit' ||
    msgObj.type === 'quote.cancel'
  );
}
