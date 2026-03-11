/**
 * GraphQL Query Validation
 *
 * Pre-execution validation for pagination limits and field alias abuse.
 * Runs before query complexity calculation for early rejection of invalid queries.
 */

import {
  DocumentNode,
  GraphQLError,
  Kind,
  visit,
  type FieldNode,
} from 'graphql';

export interface QueryValidationOptions {
  maxListSize: number;
  maxFieldAliases: number;
  variables?: Record<string, unknown>;
}

export interface QueryValidationResult {
  valid: boolean;
  error?: GraphQLError;
}

/**
 * Validates a GraphQL document for pagination limits and alias abuse.
 * Throws GraphQLError if validation fails.
 */
export function validateQuery(
  document: DocumentNode,
  options: QueryValidationOptions
): void {
  const { maxListSize, maxFieldAliases, variables = {} } = options;

  // Track field name occurrences at root level to detect alias abuse
  const rootFieldCounts = new Map<string, number>();

  visit(document, {
    Field(node: FieldNode, _key, _parent, path) {
      // Check pagination argument limits (take, first, limit)
      for (const arg of node.arguments ?? []) {
        if (['take', 'first', 'limit'].includes(arg.name.value)) {
          let value: number | undefined;

          if (arg.value.kind === Kind.INT) {
            value = parseInt(arg.value.value, 10);
          } else if (arg.value.kind === Kind.VARIABLE) {
            const varValue = variables[arg.value.name.value];
            if (typeof varValue === 'number') {
              value = varValue;
            }
          }

          if (value !== undefined && value > maxListSize) {
            throw new GraphQLError(
              `Argument "${arg.name.value}" exceeds maximum allowed value of ${maxListSize} (got ${value})`,
              {
                extensions: {
                  code: 'PAGINATION_LIMIT_EXCEEDED',
                  http: { status: 400 },
                },
              }
            );
          }
        }
      }

      // Check alias limits at root level (path depth 5 = inside operation's selectionSet)
      // Path: ['definitions', index, 'selectionSet', 'selections', index]
      if (path.length === 5) {
        const fieldName = node.name.value;
        const count = (rootFieldCounts.get(fieldName) ?? 0) + 1;
        rootFieldCounts.set(fieldName, count);

        if (count > maxFieldAliases) {
          throw new GraphQLError(
            `Field "${fieldName}" is used ${count} times, exceeding the maximum of ${maxFieldAliases} aliases per field`,
            {
              extensions: {
                code: 'FIELD_ALIAS_LIMIT_EXCEEDED',
                http: { status: 400 },
              },
            }
          );
        }
      }
    },
  });
}
