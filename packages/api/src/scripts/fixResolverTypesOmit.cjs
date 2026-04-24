#!/usr/bin/env node
/**
 * graphql-codegen's typescript plugin emits
 *   `export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;`
 * at the top of every output file. When an SDL type named `Pick`
 * exists in the same file (we have one — the prediction `Pick`
 * type), TS resolves the `Pick` reference inside the Omit definition
 * to the non-generic type alias and errors with:
 *   "Type 'Pick' is not generic"
 *
 * Rewriting the Omit body as an inline mapped type avoids the Pick
 * reference entirely and keeps the semantics identical.
 *
 * Wired from codegen-resolvers.ts via `hooks.afterOneFileWrite`.
 */

const fs = require('node:fs');

const file = process.argv[2];
if (!file) {
  console.error('fixResolverTypesOmit.cjs: expected file path as arg');
  process.exit(1);
}

const src = fs.readFileSync(file, 'utf8');
// Use a homomorphic mapped type ({ [P in keyof T as ...] }) so `?`
// optionality is preserved — a non-homomorphic mapping via
// `[P in Exclude<keyof T, K>]` would strip the `?` modifier and break
// `Omit<T, ...>` wherever codegen relies on it (see Question's
// ResolverTypes: `Omit<Question, "condition" | "group">` needs
// predictionCount to remain optional).
const fixed = src.replace(
  'export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;',
  'export type Omit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] };'
);
if (fixed !== src) {
  fs.writeFileSync(file, fixed);
}
