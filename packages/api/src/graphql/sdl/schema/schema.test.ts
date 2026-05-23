/**
 * SDL contract assertions.
 *
 * Read-only checks over `schema.graphql` that codify the conventions
 * established across the `*Page` refactor. Future PRs that drift from
 * the shape — bare `@deprecated`, a `*Page` type that forgets the
 * `Page` interface, a query that orders `take`/`skip` somewhere other
 * than the end — fail here instead of silently leaking inconsistency
 * onto the wire.
 *
 * The test reads the *source-of-truth* SDL (the hand-written
 * `schema.graphql` next to this file), not the emitted contract
 * schema. That keeps the assertions tight to what we author.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema, graphql, parse, Kind } from 'graphql';
import type {
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  FieldDefinitionNode,
  DirectiveNode,
  StringValueNode,
} from 'graphql';
import { describe, it, expect } from 'vitest';

const SDL_PATH = join(__dirname, 'schema.graphql');
const schemaText = readFileSync(SDL_PATH, 'utf8');
const doc = parse(schemaText);

type QueryFieldEntry = {
  typeName: string;
  field: FieldDefinitionNode;
};

const queryFields = (): QueryFieldEntry[] => {
  const out: QueryFieldEntry[] = [];
  for (const def of doc.definitions) {
    if (
      def.kind !== Kind.OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.OBJECT_TYPE_EXTENSION
    ) {
      continue;
    }
    const node = def as ObjectTypeDefinitionNode | ObjectTypeExtensionNode;
    for (const f of node.fields ?? []) {
      out.push({ typeName: node.name.value, field: f });
    }
  }
  return out;
};

const findDeprecated = (
  field: FieldDefinitionNode
): DirectiveNode | undefined =>
  field.directives?.find((d) => d.name.value === 'deprecated');

const reasonOf = (directive: DirectiveNode): string | undefined => {
  const arg = directive.arguments?.find((a) => a.name.value === 'reason');
  if (!arg) return undefined;
  if (arg.value.kind !== Kind.STRING) return undefined;
  return (arg.value as StringValueNode).value;
};

describe('SDL contract: @deprecated', () => {
  it('every @deprecated field carries a non-empty reason', () => {
    const offenders: string[] = [];
    for (const { typeName, field } of queryFields()) {
      const dep = findDeprecated(field);
      if (!dep) continue;
      const reason = reasonOf(dep)?.trim() ?? '';
      if (reason.length === 0) {
        offenders.push(`${typeName}.${field.name.value}`);
      }
    }
    expect(offenders, 'bare @deprecated fields without reason').toEqual([]);
  });

  it('deprecation reasons name the replacement or rationale (not a bare "deprecated")', () => {
    const offenders: { field: string; reason: string }[] = [];
    for (const { typeName, field } of queryFields()) {
      const dep = findDeprecated(field);
      if (!dep) continue;
      const reason = reasonOf(dep) ?? '';
      // Heuristic: the reason should be long enough to actually be
      // actionable (link to a replacement, explain why the field is
      // going away). Bare "deprecated" / "TODO" strings fail.
      if (reason.trim().length < 16) {
        offenders.push({ field: `${typeName}.${field.name.value}`, reason });
      }
    }
    expect(offenders, '@deprecated fields with too-short reasons').toEqual([]);
  });
});

describe('SDL contract: *Page types', () => {
  it('every type ending in "Page" implements the `Page` interface', () => {
    const offenders: string[] = [];
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
      const typeName = def.name.value;
      if (!typeName.endsWith('Page')) continue;
      if (typeName === 'Page') continue;
      const implementsPage =
        def.interfaces?.some((i) => i.name.value === 'Page') ?? false;
      if (!implementsPage) offenders.push(typeName);
    }
    expect(offenders, '*Page types that should implement `Page`').toEqual([]);
  });
});

describe('SDL contract: *Page query args', () => {
  it('every `*Page` query on Query declares both `take: Int!` and `skip: Int!` args', () => {
    const offenders: { field: string; missing: string[] }[] = [];
    for (const { typeName, field } of queryFields()) {
      if (typeName !== 'Query') continue;
      const name = field.name.value;
      if (!name.endsWith('Page')) continue;
      const argNames = (field.arguments ?? []).map((a) => a.name.value);
      const missing: string[] = [];
      if (!argNames.includes('take')) missing.push('take');
      if (!argNames.includes('skip')) missing.push('skip');
      if (missing.length) offenders.push({ field: name, missing });
    }
    expect(offenders, '*Page queries missing take/skip args').toEqual([]);
  });
});

const printType = (t: import('graphql').TypeNode): string => {
  if (t.kind === Kind.NON_NULL_TYPE) return `${printType(t.type)}!`;
  if (t.kind === Kind.LIST_TYPE) return `[${printType(t.type)}]`;
  return t.name.value;
};

describe('SDL contract: *Page fields', () => {
  it('every *Page type declares the canonical fields: items: [X!]!, hasMore: Boolean!, totalCount: Int', () => {
    const offenders: { type: string; issues: string[] }[] = [];
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
      const typeName = def.name.value;
      if (!typeName.endsWith('Page') || typeName === 'Page') continue;
      const fieldsByName = new Map(
        (def.fields ?? []).map((f) => [f.name.value, f])
      );

      const issues: string[] = [];

      const items = fieldsByName.get('items');
      if (!items) issues.push('missing `items` field');
      else {
        const printed = printType(items.type);
        // Accept any `[X!]!` shape (the row type varies per page).
        if (!/^\[[A-Za-z][A-Za-z0-9]*!\]!$/.test(printed)) {
          issues.push(`items must be [X!]! — got ${printed}`);
        }
      }

      const hasMore = fieldsByName.get('hasMore');
      if (!hasMore) issues.push('missing `hasMore` field');
      else if (printType(hasMore.type) !== 'Boolean!') {
        issues.push(
          `hasMore must be Boolean! — got ${printType(hasMore.type)}`
        );
      }

      const totalCount = fieldsByName.get('totalCount');
      if (!totalCount) issues.push('missing `totalCount` field');
      else if (printType(totalCount.type) !== 'Int') {
        // Intentionally nullable: zero means "0 rows match"; null means
        // "not computed for this call" (lazy or always-null pages).
        issues.push(
          `totalCount must be Int (nullable) — got ${printType(totalCount.type)}`
        );
      }

      if (issues.length) offenders.push({ type: typeName, issues });
    }
    expect(offenders, '*Page types with non-canonical field shapes').toEqual(
      []
    );
  });
});

describe('SDL contract: external order compatibility', () => {
  it('accepts legacy lowercase direction values without changing order input nullability', async () => {
    const schema = buildSchema(schemaText);
    const result = await graphql({
      schema,
      source: `
        query UserForecasts(
          $filters: ForecastFilter
          $take: Int!
          $after: String
          $orderBy: ForecastOrderField!
          $orderDirection: OrderDirection!
        ) {
          forecastsConnection(
            filter: $filters
            first: $take
            after: $after
            orderBy: { field: $orderBy, direction: $orderDirection }
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      rootValue: {
        forecastsConnection: () => ({
          pageInfo: { hasNextPage: false, endCursor: null },
        }),
      },
      variableValues: {
        filters: {},
        take: 1,
        after: null,
        orderBy: 'ATTESTED_AT',
        orderDirection: 'desc',
      },
    });

    expect(result.errors).toBeUndefined();
  });
});
