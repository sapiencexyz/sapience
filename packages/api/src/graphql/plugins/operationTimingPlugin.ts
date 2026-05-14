import type { ApolloServerPlugin } from '@apollo/server';
import type { OperationDefinitionNode } from 'graphql';
import type { ApolloContext } from '../startApolloServer';
import { createLogger } from '../../core/logger';
import { inflightRegistry } from '../../runtime/inflightRegistry';
import { requestContext } from '../../core/db';

/**
 * Apollo plugin that emits one structured log line per GraphQL request.
 * Captures operation name, duration, complexity, error count, sanitized
 * variables, and client identification headers — enough to attribute slow
 * queries to specific operations without leaking wallet identity.
 *
 * Output shape preserves `event:"gql_request"` so existing log filters
 * (e.g. Railway `grep '"event":"gql_request"'`) keep working. Pino adds
 * `level`, `time`, `pid`, `module:"graphql"` automatically.
 *
 * Operations exceeding SLOW_QUERY_THRESHOLD_MS are emitted at `warn` level
 * to make slow-query filtering trivial in any aggregator. Per-Q4 design,
 * warn does NOT forward to Sentry — only error/fatal do.
 *
 * `complexity` comes from contextValue.queryComplexity, populated by the
 * inline complexity plugin during didResolveOperation.
 *
 * `prismaQueries` comes from the per-request counter in `requestContext`
 * (db.ts `$extends` increments on every Prisma operation). Surfacing it
 * here turns gql_request into an N+1 detector — a 30ms `markets` query
 * firing 200 prisma calls is now obvious from a single log line.
 *
 * `outcome` is `success` for clean responses, `errors` when Apollo
 * returned a non-empty errors array. Combined with the `gql_shed` event
 * emitted by the rate-limit / concurrency layers, dashboards can produce
 * a single per-operation outcome matrix (success / errors / shed).
 *
 * The didResolveOperation hook also registers the operation name in the
 * shared in-flight registry so a concurrent shed elsewhere can include
 * this request's operation name in its occupant snapshot.
 */

const log = createLogger('graphql');

const SLOW_QUERY_THRESHOLD_MS = 500;

const SENSITIVE_VAR_NAMES = new Set([
  'address',
  'holder',
  'seller',
  'buyer',
  'predictor',
  'counterparty',
]);

const sanitizeVariables = (
  vars: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> => {
  if (!vars) return {};
  return Object.fromEntries(
    Object.entries(vars).map(([k, v]) =>
      SENSITIVE_VAR_NAMES.has(k) ? [k, '[REDACTED]'] : [k, v]
    )
  );
};

const truncate = (s: string | undefined, max = 120): string | undefined => {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

type HeaderReader = { get(name: string): string | null | undefined };

const reqIdToString = (
  reqIdRaw: string | number | object | undefined,
  headers: HeaderReader | undefined
): string | undefined => {
  if (typeof reqIdRaw === 'string' || typeof reqIdRaw === 'number') {
    return String(reqIdRaw);
  }
  return headers?.get('x-request-id') ?? undefined;
};

/**
 * Count the root resolvers invoked, including alias-driven duplicates.
 * Server-derived from the parsed GraphQL document — independent of the
 * arbitrary name the client wrote in `query Foo { ... }`.
 *
 * Aliases like `a1: conditions, a2: conditions, a3: conditions` produce
 * `{ conditions: 3 }` so cost analysis reflects the real shape of the
 * request. Only top-level FieldNodes are counted; top-level fragments
 * are rare and would need a separate fragment-resolution pass.
 *
 * Returned object is sorted alphabetically by key so identical requests
 * serialize identically (helps log dedup and hashing).
 */
function rootResolverCountsOf(
  operation: OperationDefinitionNode | undefined
): Record<string, number> {
  if (!operation) return {};
  const counts = new Map<string, number>();
  for (const selection of operation.selectionSet.selections) {
    if (selection.kind === 'Field') {
      const name = selection.name.value;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    Array.from(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

/**
 * Stable aggregation key derived from the resolver counts. Dedupes
 * aliases — three aliased `conditions` calls and one un-aliased call
 * both bucket as `"conditions"`, which is the right grain for "what's
 * hot." Per-request cost (the alias multiplication) is preserved on
 * `gql_request.rootResolvers`.
 *
 *   { conditions: 3 }              → "conditions"
 *   { conditions: 1, markets: 1 }  → "conditions+markets"
 *   {}                             → empty string (caller falls back)
 */
function joinedKeyFromCounts(counts: Record<string, number>): string {
  return Object.keys(counts).sort().join('+');
}

/**
 * Pick the registry key for a request. Prefer the deduped resolver
 * signature so dashboards group by what was actually called. Fall back
 * to operation name / header for queries with no parseable root fields
 * (introspection-only, malformed docs that still typed-checked, etc).
 */
function registryKeyFor(
  counts: Record<string, number>,
  operation: OperationDefinitionNode | undefined,
  jsonOperationName: string | null | undefined,
  headers: HeaderReader | undefined
): string {
  const joined = joinedKeyFromCounts(counts);
  if (joined) return joined;
  return (
    operation?.name?.value ??
    jsonOperationName ??
    headers?.get('x-operation-name') ??
    'anonymous'
  );
}

export function operationTimingPlugin(): ApolloServerPlugin<ApolloContext> {
  return {
    async requestDidStart() {
      const startedAt = performance.now();

      return {
        async didResolveOperation({ contextValue, request, operation }) {
          const headers = request.http?.headers;
          const requestId = reqIdToString(contextValue.req?.id, headers);
          if (!requestId) return;
          // Register by the server-derived resolver signature so the
          // periodic dump's `byOperation` map and shed-event occupant
          // snapshots aggregate by what was actually called, not by
          // whatever name the client wrote in `query Foo { ... }`.
          const counts = rootResolverCountsOf(operation);
          const key = registryKeyFor(
            counts,
            operation,
            request.operationName,
            headers
          );
          inflightRegistry.setOperation(requestId, key);
        },

        async willSendResponse({ request, response, contextValue, operation }) {
          const durationMs = Math.round(performance.now() - startedAt);

          const body = response.body;
          const errorCount =
            body.kind === 'single'
              ? (body.singleResult.errors?.length ?? 0)
              : 0;

          const headers = request.http?.headers;
          const clientName = headers?.get('apollographql-client-name');
          const userAgent = headers?.get('user-agent');
          const requestId = reqIdToString(contextValue.req?.id, headers);
          const prismaQueries = requestContext.getStore()?.count;

          const rootResolvers = rootResolverCountsOf(operation);

          const fields = {
            event: 'gql_request',
            // Server-derived counts of root resolvers invoked, including
            // alias-driven duplicates. `{ conditions: 3 }` means three
            // aliased calls (real cost), not one. Trustworthy.
            rootResolvers,
            // Client-supplied name — useful when clients name queries
            // sensibly, but arbitrary in general. Kept for cross-checking.
            operationName:
              operation?.name?.value ??
              request.operationName ??
              headers?.get('x-operation-name') ??
              'anonymous',
            operationType: operation?.operation ?? 'unknown',
            outcome: errorCount > 0 ? 'errors' : 'success',
            durationMs,
            prismaQueries,
            complexity: contextValue.queryComplexity,
            errors: errorCount,
            variables: sanitizeVariables(request.variables),
            clientName: clientName ?? undefined,
            userAgent: truncate(userAgent ?? undefined),
            requestId,
          };

          if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            log.warn(fields, 'gql_request');
          } else {
            log.info(fields, 'gql_request');
          }
        },
      };
    },
  };
}
