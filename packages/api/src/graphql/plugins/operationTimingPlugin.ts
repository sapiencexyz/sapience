import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';
import { createLogger } from '../../core/logger';

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

export function operationTimingPlugin(): ApolloServerPlugin<ApolloContext> {
  return {
    async requestDidStart() {
      const startedAt = performance.now();

      return {
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
          // pino-http types req.id as ReqId (string | number | object); coerce
          // to string for stable log output. Falls back to upstream header so
          // requests outside the Express stack (tests, scripts) still log a
          // correlation id when available.
          const reqIdRaw = contextValue.req?.id;
          const requestId =
            reqIdRaw != null
              ? String(reqIdRaw)
              : (headers?.get('x-request-id') ?? undefined);

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
