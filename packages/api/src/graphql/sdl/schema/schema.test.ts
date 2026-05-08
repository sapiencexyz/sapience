/**
 * Schema-level conventions enforced as tests so reviewers don't have
 * to remember them. The rules:
 *
 *   1. Every Query field whose return type implements `Page` (i.e. the
 *      `*Page` wrapper types) must end its argument list with
 *      `take, skip` in that order. Pinning the order across resolvers
 *      keeps client-side query strings predictable and matches the
 *      Prisma signature.
 *   2. All non-pagination args on those fields must be in alphabetical
 *      order. Easier to scan, easier to spot duplicates, removes a
 *      class of pointless review nits.
 *
 * If a deliberate exception ever shows up, add it to ALLOWED_DEVIATIONS
 * with a comment — don't loosen the rule.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parse,
  type DocumentNode,
  type ObjectTypeDefinitionNode,
  type FieldDefinitionNode,
  type InterfaceTypeDefinitionNode,
} from 'graphql';

const ALLOWED_DEVIATIONS = new Set<string>();

const loadSchema = (): DocumentNode => {
  const path = join(__dirname, 'schema.graphql');
  return parse(readFileSync(path, 'utf8'));
};

const findType = <T extends { name?: { value: string }; kind: string }>(
  doc: DocumentNode,
  kind: string,
  name: string
): T | undefined =>
  doc.definitions.find(
    (d) =>
      'name' in d &&
      d.kind === kind &&
      (d.name as { value: string })?.value === name
  ) as T | undefined;

const collectPageImplementingTypeNames = (doc: DocumentNode): Set<string> => {
  const out = new Set<string>();
  for (const def of doc.definitions) {
    if (def.kind !== 'ObjectTypeDefinition') continue;
    const obj = def as ObjectTypeDefinitionNode;
    if (obj.interfaces?.some((i) => i.name.value === 'Page')) {
      out.add(obj.name.value);
    }
  }
  return out;
};

const unwrapType = (typeNode: FieldDefinitionNode['type']): string => {
  let t = typeNode;
  while (t.kind === 'NonNullType' || t.kind === 'ListType') {
    t = t.type;
  }
  return t.name.value;
};

describe('schema convention: *Page query args end with take, skip', () => {
  const doc = loadSchema();
  const queryType = findType<ObjectTypeDefinitionNode>(
    doc,
    'ObjectTypeDefinition',
    'Query'
  );
  if (!queryType) throw new Error('Query type missing from schema');

  const pageInterface = findType<InterfaceTypeDefinitionNode>(
    doc,
    'InterfaceTypeDefinition',
    'Page'
  );
  if (!pageInterface) throw new Error('Page interface missing from schema');

  const pageTypeNames = collectPageImplementingTypeNames(doc);

  const pageReturningFields = (queryType.fields ?? []).filter((f) =>
    pageTypeNames.has(unwrapType(f.type))
  );

  it('finds the *Page-returning Query fields to lint', () => {
    expect(pageReturningFields.length).toBeGreaterThan(5);
  });

  for (const field of pageReturningFields) {
    if (ALLOWED_DEVIATIONS.has(field.name.value)) continue;
    it(`Query.${field.name.value} ends with take then skip`, () => {
      const args = (field.arguments ?? []).map((a) => a.name.value);
      expect(args.length).toBeGreaterThanOrEqual(2);
      const last = args.slice(-2);
      expect(last).toEqual(['take', 'skip']);
    });

    it(`Query.${field.name.value} has alphabetically-sorted non-pagination args`, () => {
      const args = (field.arguments ?? []).map((a) => a.name.value);
      const nonPagination = args.slice(0, -2);
      const sorted = [...nonPagination].sort();
      expect(nonPagination).toEqual(sorted);
    });
  }
});
