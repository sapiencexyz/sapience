import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import storybookPlugin from 'eslint-plugin-storybook';
import importPlugin from 'eslint-plugin-import';
import typescriptPlugin from 'typescript-eslint';

export default typescriptPlugin.config(
  js.configs.recommended,
  // Typed rules for TS/TSX; we'll ignore JS/config files in this package.
  typescriptPlugin.configs.recommendedTypeChecked,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    ignores: [
      'dist/**',
      'storybook-static/**',
      'node_modules/**',
      'eslint.config.mjs',
      '**/*.d.ts',
      // This package isn't trying to lint JS config files right now; keep lint focused on TS/TSX.
      '**/*.{js,mjs,cjs}',
      // Storybook config + stories often have different constraints and aren't worth blocking CI here.
      '.storybook/**',
      'stories/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        project: 'tsconfig.json',
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
      storybook: storybookPlugin,
      '@typescript-eslint': typescriptPlugin.plugin,
    },
    rules: {
      // Keep UI package lint lightweight and mostly-sane.
      'no-console': 'off',
      'no-useless-escape': 'warn',
      'react/prop-types': 'off',
      'react/jsx-key': 'warn',
      'react/no-array-index-key': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      'import/order': 'warn',
    },
    settings: {
      react: { version: 'detect' },
    },
  }
);


