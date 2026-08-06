import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import typescriptPlugin from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';

export default typescriptPlugin.config(
  // Global ignores - test files excluded from tsconfig
  {
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.js',
      // Generated from the API's GraphQL schema — never hand-edited.
      'src/lib/sdk/types/graphql.ts',
    ],
  },
  // Base JavaScript recommended config
  js.configs.recommended,
  // TypeScript files
  typescriptPlugin.configs.recommendedTypeChecked,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      'src/schema.graphql'
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        project: "tsconfig.json",
      },
    },
  },

  // Targeted override: the manifest needs literal hex colours. The OG renderer
  // and its palette used to be listed here too; both were removed with the
  // server routes.
  {
    files: ['src/app/manifest.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'import': importPlugin,
      'next': nextPlugin,
      '@typescript-eslint': typescriptPlugin.plugin,
    },
    rules: {
      // Base rules
      'consistent-return': 'off',
      'no-console': 'off',
      'semi': ['warn', 'always'],
      'complexity': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'Avoid raw hex color literals; use theme tokens (Tailwind classes or cssVars helpers).',
        },
      ],
      'no-empty-pattern': 'warn',
      'no-plusplus': 'off',
      'no-restricted-globals': 'warn',
      'no-underscore-dangle': 'off',
      "no-unused-vars": "off",

      
      // React rules
      'react/prop-types': 'off',
      'react/jsx-key': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/jsx-no-constructed-context-values': 'off',
      'react/destructuring-assignment': 'warn',
      'react/no-array-index-key': 'off',
      
      // React Hooks rules
      'react-hooks/exhaustive-deps': 'warn',
      
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all",
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],  
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // DANGER ZONE: Turn on when looking for bugs! (MOM TOLD ME TO TURN IT OFF I SWEAR)
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // Import rules
      'import/extensions': 'off',
      'import/order': 'warn'
    },
    settings: {
      react: {
        version: 'detect'
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.json'
        }
      }
    }
  },

);
