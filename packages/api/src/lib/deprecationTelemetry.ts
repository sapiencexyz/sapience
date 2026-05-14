/**
 * Per-request telemetry for `@deprecated` resolver hits.
 *
 * Every call into a deprecated wrapper (or a deprecated field on a live
 * resolver) routes through `logDeprecatedHit(name)`. The structured log
 * line is what gates the eventual deletion in the final cleanup PR —
 * once the per-resolver call count drains to ~zero across the
 * deprecation window, the field can be removed.
 *
 * The log line is intentionally cheap (no enrichment beyond the
 * resolver name); a per-request request id from the operation-timing
 * plugin already lands on the surrounding `http /graphql` row, so
 * grepping by `event=deprecated_resolver name=X` and joining on
 * `requestId` is enough to attribute hits to clients.
 *
 * Keep the message text stable — log-aggregator queries grep on it.
 */
import { createLogger } from '../core/logger';

const log = createLogger('deprecation');

export const logDeprecatedHit = (name: string): void => {
  log.info(
    { event: 'deprecated_resolver', name },
    'deprecated GraphQL resolver hit'
  );
};
