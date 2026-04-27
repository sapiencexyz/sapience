import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';

/**
 * Apollo plugin that emits one structured JSON log line per GraphQL request.
 * Captures operation name, duration, complexity, error count, sanitized
 * variables, and client identification headers — enough to attribute slow
 * queries to specific operations without leaking wallet identity.
 *
 * Output (single line per request, written to stdout):
 *   {"event":"gql_request","operationName":"GetQuestionsSorted","durationMs":712,...}
 *
 * Railway captures stdout: `grep '"event":"gql_request"'` surfaces just
 * GraphQL events; pipe through `jq` for ad-hoc analysis.
 *
 * The `complexity` field is read from contextValue.queryComplexity, which
 * the inline query-complexity plugin in startApolloServer.ts populates
 * during didResolveOperation.
 */

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
          const requestId = headers?.get('x-request-id');

          const log = {
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
            requestId: requestId ?? undefined,
          };

          console.log(JSON.stringify(log));
        },
      };
    },
  };
}
