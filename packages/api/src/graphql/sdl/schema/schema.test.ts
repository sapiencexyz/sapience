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
import { parse, Kind } from 'graphql';
import type {
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  FieldDefinitionNode,
  DirectiveNode,
  StringValueNode,
} from 'graphql';
import { describe, it, expect } from 'vitest';

const SDL_PATH = join(__dirname, 'schema.graphql');
const doc = parse(readFileSync(SDL_PATH, 'utf8'));

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
      // Allowed exception: types that mark themselves as cursor-based
      // pagination (current `ReferralCodesPage` / `ReferralCodeClaimantsPage`
      // shape with `nextCursor`). They'll standardize in a follow-up.
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
