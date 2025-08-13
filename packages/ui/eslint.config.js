// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import typescriptPlugin from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';
import graphqlPlugin from '@graphql-eslint/eslint-plugin';

export default typescriptPlugin.config(// Base JavaScript recommended config
js.configs.recommended, // TypeScript files
typescriptPlugin.configs.recommendedTypeChecked, reactPlugin.configs.flat['jsx-runtime'], {
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
      project: "tsconfig.json",
    },
  },
}, {
  files: ['**/*.ts', '**/*.tsx'],
  ignores: [
    'src/types/graphql.ts',
    'src/lib/api.ts',
  ],
  plugins: {
    'react': reactPlugin,
    'react-hooks': reactHooksPlugin,
    'import': importPlugin,
    'next': nextPlugin,
    '@typescript-eslint': typescriptPlugin.plugin,
  },
  processor: graphqlPlugin.processor,
  rules: {
    // Base rules
    'consistent-return': 'off',
    'no-console': 'off',
    'semi': ['warn', 'always'],
    'complexity': 'off',
    'no-restricted-syntax': 'off',
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
    '@typescript-eslint/no-explicit-any': 'warn',
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
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        'js': 'never',
        'jsx': 'never',
        'ts': 'never',
        'tsx': 'never'
      }
    ],
    'import/order': 'warn'
  },
  settings: {
    react: {
      version: 'detect'
    },
    'import/resolver': {
      typescript: {
        project: 'packages/app/tsconfig.json'
      }
    }
  }
}, // Ignorelist
{
  files: [
    'types/graphql.ts', 
    'lib/api.ts', 
    'eslint.config.js', 
    'graphql.config.js', 
    'tailwind.config.js', 
    'tailwind-preset.js',
    '**/*.graphql'
  ],
  rules: {
    'no-undef': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-array-constructor': 'off',
    '@typescript-eslint/no-array-constructor': 'off',
    '@typescript-eslint/no-array-delete': 'off',
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/no-duplicate-enum-values': 'off',
    '@typescript-eslint/no-duplicate-type-constituents': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-extra-non-null-assertion': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-for-in-array': 'off',
    'no-implied-eval': 'off',
    '@typescript-eslint/no-implied-eval': 'off',
    '@typescript-eslint/no-misused-new': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-unnecessary-type-constraint': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-declaration-merging': 'off',
    '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    '@typescript-eslint/no-unsafe-function-type': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-unary-minus': 'off',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-expressions': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-wrapper-object-types': 'off',
    'no-throw-literal': 'off',
    '@typescript-eslint/only-throw-error': 'off',
    '@typescript-eslint/prefer-as-const': 'off',
    '@typescript-eslint/prefer-namespace-keyword': 'off',
    'prefer-promise-reject-errors': 'off',
    '@typescript-eslint/prefer-promise-reject-errors': 'off',
    'require-await': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/restrict-plus-operands': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    '@typescript-eslint/unbound-method': 'off',
  }
}, // GraphQL files
{
  files: ['**/*.graphql'],
  languageOptions: {
    parser: graphqlPlugin.parser,
  },
  plugins: {
    '@graphql-eslint': graphqlPlugin,
  },
  rules: {
    '@graphql-eslint/no-anonymous-operations': 'error',
    '@graphql-eslint/fields-on-correct-type': 'error',
    '@graphql-eslint/known-argument-names': 'error',
    '@graphql-eslint/known-type-names': 'error',
    '@graphql-eslint/no-unused-variables': 'error',
    '@graphql-eslint/no-undefined-variables': 'error',
    '@graphql-eslint/naming-convention': [
      'error',
      {
        OperationDefinition: {
          forbiddenPrefixes: ['Query', 'Mutation', 'Subscription', 'Get'],
          forbiddenSuffixes: ['Query', 'Mutation', 'Subscription'],
        },
        allowLeadingUnderscore: true,
      },
    ],
  },
}, storybook.configs["flat/recommended"]);
