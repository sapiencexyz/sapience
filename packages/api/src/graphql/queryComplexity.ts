/**
 * GraphQL Query Complexity Calculator
 *
 * This is an adaptation of graphql-query-complexity (https://github.com/slicknode/graphql-query-complexity)
 * Original work by Ivo Meißner, licensed under MIT.
 *
 * WHY THIS EXISTS:
 * The original library imports from 'graphql/execution/values' which triggers
 * the "dual package hazard" in ESM + pnpm environments. Node.js loads both CJS
 * and ESM versions of graphql as separate module instances, causing instanceof
 * checks to fail with "Cannot use GraphQLObjectType from another module".
 *
 * This adaptation imports everything from the main 'graphql' package to ensure
 * a single module instance is used throughout.
 *
 * See: https://github.com/slicknode/graphql-query-complexity/issues/65
 * See: https://github.com/graphql/graphql-js/issues/4062
 */

import {
  ValidationContext,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  FieldNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  GraphQLField,
  isCompositeType,
  GraphQLCompositeType,
  GraphQLFieldMap,
  GraphQLSchema,
  DocumentNode,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  GraphQLDirective,
  isAbstractType,
  GraphQLNamedType,
  GraphQLUnionType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  Kind,
  getNamedType,
  GraphQLError,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
  // These were previously imported from 'graphql/execution/values' which caused the dual package hazard
  getArgumentValues,
  getDirectiveValues,
  getVariableValues,
} from 'graphql';

export type ComplexityEstimatorArgs = {
  type: GraphQLCompositeType;
  field: GraphQLField<unknown, unknown>;
  node: FieldNode;
  args: Record<string, unknown>;
  childComplexity: number;
  context?: Record<string, unknown>;
};

export type ComplexityEstimator = (
  options: ComplexityEstimatorArgs
) => number | void;

type ComplexityMap = {
  [typeName: string]: number;
};

export interface QueryComplexityOptions {
  maximumComplexity: number;
  variables?: Record<string, unknown>;
  operationName?: string;
  onComplete?: (complexity: number) => void;
  createError?: (max: number, actual: number) => GraphQLError;
  estimators: Array<ComplexityEstimator>;
  context?: Record<string, unknown>;
  maxQueryNodes?: number;
}

function queryComplexityMessage(max: number, actual: number): string {
  return (
    `The query exceeds the maximum complexity of ${max}. ` +
    `Actual complexity is ${actual}`
  );
}

export function getComplexity(options: {
  estimators: ComplexityEstimator[];
  schema: GraphQLSchema;
  query: DocumentNode;
  variables?: Record<string, unknown>;
  operationName?: string;
  context?: Record<string, unknown>;
  maxQueryNodes?: number;
}): number {
  const typeInfo = new TypeInfo(options.schema);

  const errors: GraphQLError[] = [];
  const context = new ValidationContext(
    options.schema,
    options.query,
    typeInfo,
    (error) => errors.push(error)
  );
  const visitor = new QueryComplexity(context, {
    maximumComplexity: Infinity,
    estimators: options.estimators,
    variables: options.variables,
    operationName: options.operationName,
    context: options.context,
    maxQueryNodes: options.maxQueryNodes,
  });

  visit(options.query, visitWithTypeInfo(typeInfo, visitor));

  if (errors.length) {
    throw errors.pop();
  }

  return visitor.complexity;
}

export class QueryComplexity {
  context: ValidationContext;
  complexity: number;
  options: QueryComplexityOptions;
  OperationDefinition: Record<string, unknown>;
  estimators: Array<ComplexityEstimator>;
  includeDirectiveDef: GraphQLDirective | undefined;
  skipDirectiveDef: GraphQLDirective | undefined;
  variableValues: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  evaluatedNodes: number;
  maxQueryNodes: number;

  constructor(context: ValidationContext, options: QueryComplexityOptions) {
    if (
      !(
        typeof options.maximumComplexity === 'number' &&
        options.maximumComplexity > 0
      )
    ) {
      throw new Error('Maximum query complexity must be a positive number');
    }

    this.context = context;
    this.complexity = 0;
    this.options = options;
    this.evaluatedNodes = 0;
    this.maxQueryNodes = options.maxQueryNodes ?? 10_000;
    this.includeDirectiveDef =
      this.context.getSchema().getDirective('include') ?? undefined;
    this.skipDirectiveDef =
      this.context.getSchema().getDirective('skip') ?? undefined;
    this.estimators = options.estimators;
    this.variableValues = {};
    this.requestContext = options.context;

    this.OperationDefinition = {
      enter: this.onOperationDefinitionEnter.bind(this),
      leave: this.onOperationDefinitionLeave.bind(this),
    };
  }

  onOperationDefinitionEnter(operation: OperationDefinitionNode): void {
    if (
      typeof this.options.operationName === 'string' &&
      this.options.operationName !== operation.name?.value
    ) {
      return;
    }

    const { coerced, errors } = getVariableValues(
      this.context.getSchema(),
      operation.variableDefinitions ? [...operation.variableDefinitions] : [],
      this.options.variables ?? {}
    );
    if (errors && errors.length) {
      errors.forEach((error) => this.context.reportError(error));
      return;
    }
    this.variableValues = coerced ?? {};

    switch (operation.operation) {
      case 'query':
        this.complexity += this.nodeComplexity(
          operation,
          this.context.getSchema().getQueryType() ?? undefined
        );
        break;
      case 'mutation':
        this.complexity += this.nodeComplexity(
          operation,
          this.context.getSchema().getMutationType() ?? undefined
        );
        break;
      case 'subscription':
        this.complexity += this.nodeComplexity(
          operation,
          this.context.getSchema().getSubscriptionType() ?? undefined
        );
        break;
      default:
        throw new Error(
          `Query complexity could not be calculated for operation of type ${operation.operation}`
        );
    }
  }

  onOperationDefinitionLeave(
    operation: OperationDefinitionNode
  ): GraphQLError | void {
    if (
      typeof this.options.operationName === 'string' &&
      this.options.operationName !== operation.name?.value
    ) {
      return;
    }

    if (this.options.onComplete) {
      this.options.onComplete(this.complexity);
    }

    if (this.complexity > this.options.maximumComplexity) {
      return this.context.reportError(this.createError());
    }
  }

  nodeComplexity(
    node:
      | FieldNode
      | FragmentDefinitionNode
      | InlineFragmentNode
      | OperationDefinitionNode,
    typeDef:
      | GraphQLObjectType
      | GraphQLInterfaceType
      | GraphQLUnionType
      | undefined
  ): number {
    if (node.selectionSet && typeDef) {
      let fields: GraphQLFieldMap<unknown, unknown> = {};
      if (
        typeDef instanceof GraphQLObjectType ||
        typeDef instanceof GraphQLInterfaceType
      ) {
        fields = typeDef.getFields();
      }

      let possibleTypeNames: string[];
      if (isAbstractType(typeDef)) {
        possibleTypeNames = this.context
          .getSchema()
          .getPossibleTypes(typeDef)
          .map((t) => t.name);
      } else {
        possibleTypeNames = [typeDef.name];
      }

      const selectionSetComplexities: ComplexityMap =
        node.selectionSet.selections.reduce(
          (
            complexities: ComplexityMap,
            childNode: FieldNode | FragmentSpreadNode | InlineFragmentNode
          ): ComplexityMap => {
            this.evaluatedNodes++;
            if (this.evaluatedNodes >= this.maxQueryNodes) {
              throw new GraphQLError(
                'Query exceeds the maximum allowed number of nodes.',
                {
                  extensions: {
                    code: 'QUERY_NODE_LIMIT_EXCEEDED',
                    http: { status: 400 },
                  },
                }
              );
            }
            let innerComplexities = complexities;

            let includeNode = true;
            let skipNode = false;

            for (const directive of childNode.directives ?? []) {
              const directiveName = directive.name.value;
              switch (directiveName) {
                case 'include': {
                  if (this.includeDirectiveDef) {
                    const values = getDirectiveValues(
                      this.includeDirectiveDef,
                      childNode,
                      this.variableValues
                    );
                    if (values && typeof values.if === 'boolean') {
                      includeNode = values.if;
                    }
                  }
                  break;
                }
                case 'skip': {
                  if (this.skipDirectiveDef) {
                    const values = getDirectiveValues(
                      this.skipDirectiveDef,
                      childNode,
                      this.variableValues
                    );
                    if (values && typeof values.if === 'boolean') {
                      skipNode = values.if;
                    }
                  }
                  break;
                }
              }
            }

            if (!includeNode || skipNode) {
              return complexities;
            }

            switch (childNode.kind) {
              case Kind.FIELD: {
                let field: GraphQLField<unknown, unknown> | null = null;

                switch (childNode.name.value) {
                  case SchemaMetaFieldDef.name:
                    field = SchemaMetaFieldDef;
                    break;
                  case TypeMetaFieldDef.name:
                    field = TypeMetaFieldDef;
                    break;
                  case TypeNameMetaFieldDef.name:
                    field = TypeNameMetaFieldDef;
                    break;
                  default:
                    field = fields[childNode.name.value] ?? null;
                    break;
                }

                if (!field) {
                  break;
                }
                const fieldType = getNamedType(field.type);

                let args: Record<string, unknown>;
                try {
                  args = getArgumentValues(
                    field,
                    childNode,
                    this.variableValues
                  );
                } catch (e) {
                  if (e instanceof GraphQLError) {
                    this.context.reportError(e);
                  }
                  return complexities;
                }

                let childComplexity = 0;
                if (isCompositeType(fieldType)) {
                  childComplexity = this.nodeComplexity(childNode, fieldType);
                }

                const estimatorArgs: ComplexityEstimatorArgs = {
                  childComplexity,
                  args,
                  field,
                  node: childNode,
                  type: typeDef,
                  context: this.requestContext,
                };
                const validScore = this.estimators.find((estimator) => {
                  const tmpComplexity = estimator(estimatorArgs);

                  if (
                    typeof tmpComplexity === 'number' &&
                    !isNaN(tmpComplexity)
                  ) {
                    innerComplexities = addComplexities(
                      tmpComplexity,
                      complexities,
                      possibleTypeNames
                    );
                    return true;
                  }

                  return false;
                });
                if (!validScore) {
                  this.context.reportError(
                    new GraphQLError(
                      `No complexity could be calculated for field ${typeDef.name}.${field.name}. ` +
                        'At least one complexity estimator has to return a complexity score.'
                    )
                  );
                  return complexities;
                }
                break;
              }
              case Kind.FRAGMENT_SPREAD: {
                const fragment = this.context.getFragment(childNode.name.value);
                if (!fragment) {
                  break;
                }
                const fragmentType = this.context
                  .getSchema()
                  .getType(fragment.typeCondition.name.value);
                if (!isCompositeType(fragmentType)) {
                  break;
                }
                const nodeComplexity = this.nodeComplexity(
                  fragment,
                  fragmentType
                );
                if (isAbstractType(fragmentType)) {
                  innerComplexities = addComplexities(
                    nodeComplexity,
                    complexities,
                    this.context
                      .getSchema()
                      .getPossibleTypes(fragmentType)
                      .map((t) => t.name)
                  );
                } else {
                  innerComplexities = addComplexities(
                    nodeComplexity,
                    complexities,
                    [fragmentType.name]
                  );
                }
                break;
              }
              case Kind.INLINE_FRAGMENT: {
                let inlineFragmentType: GraphQLNamedType | undefined = typeDef;
                if (childNode.typeCondition && childNode.typeCondition.name) {
                  inlineFragmentType =
                    this.context
                      .getSchema()
                      .getType(childNode.typeCondition.name.value) ?? undefined;
                  if (
                    !inlineFragmentType ||
                    !isCompositeType(inlineFragmentType)
                  ) {
                    break;
                  }
                }

                if (!inlineFragmentType) {
                  break;
                }

                const nodeComplexity = this.nodeComplexity(
                  childNode,
                  inlineFragmentType as
                    | GraphQLObjectType
                    | GraphQLInterfaceType
                    | GraphQLUnionType
                );
                if (isAbstractType(inlineFragmentType)) {
                  innerComplexities = addComplexities(
                    nodeComplexity,
                    complexities,
                    this.context
                      .getSchema()
                      .getPossibleTypes(
                        inlineFragmentType as
                          | GraphQLUnionType
                          | GraphQLInterfaceType
                      )
                      .map((t) => t.name)
                  );
                } else {
                  innerComplexities = addComplexities(
                    nodeComplexity,
                    complexities,
                    [inlineFragmentType.name]
                  );
                }
                break;
              }
              default: {
                innerComplexities = addComplexities(
                  this.nodeComplexity(
                    childNode as FieldNode | InlineFragmentNode,
                    typeDef
                  ),
                  complexities,
                  possibleTypeNames
                );
                break;
              }
            }

            return innerComplexities;
          },
          {}
        );
      if (!selectionSetComplexities) {
        return NaN;
      }
      return Math.max(...Object.values(selectionSetComplexities), 0);
    }
    return 0;
  }

  createError(): GraphQLError {
    if (typeof this.options.createError === 'function') {
      return this.options.createError(
        this.options.maximumComplexity,
        this.complexity
      );
    }
    return new GraphQLError(
      queryComplexityMessage(this.options.maximumComplexity, this.complexity),
      {
        extensions: {
          code: 'QUERY_COMPLEXITY_EXCEEDED',
          http: { status: 400 },
        },
      }
    );
  }
}

function addComplexities(
  complexity: number,
  complexityMap: ComplexityMap,
  possibleTypes: string[]
): ComplexityMap {
  for (const type of possibleTypes) {
    if (Object.prototype.hasOwnProperty.call(complexityMap, type)) {
      complexityMap[type] += complexity;
    } else {
      complexityMap[type] = complexity;
    }
  }
  return complexityMap;
}

// Re-export estimators for convenience
export { simpleEstimator } from './estimators/simpleEstimator.js';
export { fieldExtensionsEstimator } from './estimators/fieldExtensionsEstimator.js';
export { listMultiplierEstimator } from './estimators/listMultiplierEstimator.js';
export { fieldCostEstimator } from './estimators/fieldCostEstimator.js';

// Direct imports for use in createComplexityEstimators
// (type-only imports in estimator files prevent circular dependency issues at runtime)
import { simpleEstimator as _simple } from './estimators/simpleEstimator.js';
import { fieldExtensionsEstimator as _fieldExt } from './estimators/fieldExtensionsEstimator.js';
import { listMultiplierEstimator as _listMult } from './estimators/listMultiplierEstimator.js';
import { fieldCostEstimator as _fieldCost } from './estimators/fieldCostEstimator.js';

/**
 * Create the standard complexity estimators used across the API.
 * Shared by Apollo Server validation and x402 pricing middleware.
 */
export function createComplexityEstimators(
  maxListSize: number
): ComplexityEstimator[] {
  return [
    _fieldExt(),
    _fieldCost((fieldName: string) => {
      // Aggregate fields that require full table scans
      if (fieldName === '_all') return 10000;
      if (fieldName.startsWith('_count')) return 5000;
      if (fieldName.startsWith('_sum')) return 5000;
      if (fieldName.startsWith('_avg')) return 5000;
      if (fieldName.startsWith('_min')) return 5000;
      if (fieldName.startsWith('_max')) return 5000;
      // Expensive custom queries — heavy SQL aggregations
      if (fieldName === 'protocolStats') return 2000;
      if (fieldName === 'profitLeaderboard') return 2000;
      if (fieldName === 'accountTotalVolume') return 500;
      if (fieldName === 'accountProfitRank') return 500;
      // Time-series analytics — heavy SQL with generate_series + aggregation
      if (fieldName === 'accountVolume') return 1000;
      if (fieldName === 'accountPnl') return 1500;
      if (fieldName === 'accountBalance') return 2000;
      if (fieldName === 'accountPredictionCount') return 1000;
      if (fieldName === 'protocolVolume') return 1500;
      // Full-table groupBy aggregates (no cache)
      if (fieldName === 'accuracyLeaderboard') return 1500;
      if (fieldName === 'accountAccuracyRank') return 1500;
      // Introspection fields — cost for mixed queries
      if (fieldName === '__schema') return 100;
      if (fieldName === '__type') return 50;
      return undefined;
    }),
    _listMult({ defaultListSize: 10, maxListSize }),
    _simple({ defaultComplexity: 1 }),
  ];
}
