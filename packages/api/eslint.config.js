import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.node }},
  {ignores: ["src/graphql/types/generated.ts", "src/graphql/sdl/__generated__/**", "src/graphql/v2/__generated__/**"]},
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
      // Use `logger` from src/core/logger.ts. Object-first call shape:
      //   logger.info({ field }, 'message')
      //   logger.error({ err }, 'message')   // err in object preserves stack
      'no-console': 'error',
    },
  },
  {
    // instrument.ts runs Sentry init before the logger module loads, so it
    // can't use `logger`. One-off scripts (src/scripts/*, scripts/*) and
    // prisma/seed.ts are CLI tools where console output is the intentional UX.
    files: [
      'src/core/instrument.ts',
      'src/scripts/**',
      'scripts/**',
      'prisma/seed.ts',
    ],
    rules: {
      'no-console': 'off',
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
