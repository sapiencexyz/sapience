import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.node }},
  {ignores: ["src/graphql/types/generated.ts", "src/graphql/sdl/__generated__/**"]},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'import': importPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
      'import/order': 'warn',
    },
  },
  {
    // .cjs files are CommonJS by design; `require()` is the only way
    // to import, so the TS-default ban doesn't apply.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
