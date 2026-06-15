import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';
import { createLogger } from '../../core/logger';
import { inflightRegistry } from '../../runtime/inflightRegistry';

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

// Wallet addresses are sensitive. v1 passed them as top-level variables
// (holder/buyer/…) so a flat redactor sufficed; v2 moved them inside
// `filter` input objects (filter:{ holder }), so redaction must follow them
// however deep they nest. redactDeep walks the whole variable tree.
const redactDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SENSITIVE_VAR_NAMES.has(k)
          ? [k, '[REDACTED]']
          : // A non-sensitive key (e.g. `filter`) can still hold a sensitive
            // one deeper down — recurse so nested addresses get caught. A
            // scalar `v` returns unchanged via the base case.
            [k, redactDeep(v)]
      )
    );
  }
  return value;
};

const sanitizeVariables = (
  vars: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> => {
  if (!vars) return {};
  return redactDeep(vars) as Record<string, unknown>;
};

const truncate = (s: string | undefined, max = 120): string | undefined => {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

type GetHeader = { get(name: string): string | null | undefined };

function resolveRequestId(
  contextValue: ApolloContext,
  headers: GetHeader | undefined
): string | undefined {
  // pino-http types req.id as ReqId (string | number | object); coerce
  // to string for stable log output. Falls back to upstream header so
  // requests outside the Express stack (tests, scripts) still log a
  // correlation id when available.
  const reqIdRaw = contextValue.req?.id;
  if (reqIdRaw != null) return String(reqIdRaw);
  return headers?.get('x-request-id') ?? undefined;
}

export function operationTimingPlugin(): ApolloServerPlugin<ApolloContext> {
  return {
    async requestDidStart() {
      const startedAt = performance.now();

      return {
        // didResolveOperation is the earliest hook that has the parsed
        // operation name. Push it onto the inflight registry so a
        // concurrency-limit dump shows "GetUserPositions" instead of
        // the parsing/unknown placeholder. requestDidStart is too early
        // (no operation yet); willSendResponse is too late (the slot is
        // about to be removed anyway).
        async didResolveOperation({ request, contextValue, operation }) {
          const headers = request.http?.headers;
          const requestId = resolveRequestId(contextValue, headers);
          if (!requestId) return;
          const operationName =
            operation?.name?.value ?? request.operationName ?? 'anonymous';
          inflightRegistry.setOperation(requestId, operationName);
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
          const requestId = resolveRequestId(contextValue, headers);

          const fields = {
            event: 'gql_request',
            operationName:
              operation?.name?.value ?? request.operationName ?? 'anonymous',
            operationType: operation?.operation ?? 'unknown',
            durationMs,
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
