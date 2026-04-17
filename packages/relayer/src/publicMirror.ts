/**
 * Public Committed-Intent Mirror
 *
 * V1 implementation of PRD-001 §4.9 — the public quote mirror. The simplest
 * possible approach: re-broadcast every `commitment.*` event to a well-known
 * topic (`mirror:all`) on the existing WS transport. The commitment-executor
 * keeper (Fase 5) and any other third-party executor subscribe to that topic
 * to participate in the T₂ execution window.
 *
 * Deliberately minimal:
 *   - No separate HTTP/SSE feed (future enhancement noted below).
 *   - No re-signing, no payload mutation — quotes are forwarded exactly as
 *     received from counterparties.
 *   - Subscription management lives in the standard `SubscriptionManager`,
 *     no new data structure.
 *
 * Future enhancement (PRD §4.9 sub-knob): a richer HTTP/SSE endpoint with
 * a signed feed / content-addressed quote store. Not required for v1. When
 * that lands, it can reuse the same fan-out helpers below by adding a new
 * transport adapter.
 */

import type { SubscriptionManager } from './transport/types';
import type { CommittedIntentServerMessage } from '@sapience/sdk/relayer/committedIntentMessages';

/** Canonical topic name used by executors to subscribe to the public mirror. */
export const MIRROR_TOPIC = 'mirror:all';

/** Message types mirrored to the public feed per §4.9. */
export type MirrorableMessage = Extract<
  CommittedIntentServerMessage,
  {
    type:
      | 'commitment.created'
      | 'commitment.quote'
      | 'commitment.executed'
      | 'commitment.expired'
      | 'commitment.slashed';
  }
>;

/**
 * Push a mirrorable committed-intent event to every client subscribed to
 * `MIRROR_TOPIC`. Returns the number of subscribers that received it.
 *
 * Safe to call unconditionally — if no one is subscribed, this is a no-op.
 * Callers must already have validated / accepted the event; the mirror
 * does not re-verify anything.
 */
export function publishToMirror(
  subs: SubscriptionManager,
  msg: MirrorableMessage
): number {
  return subs.broadcast(MIRROR_TOPIC, msg);
}
