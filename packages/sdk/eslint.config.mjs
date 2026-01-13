import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import typescriptPlugin from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx,cts,mts}'];

// `recommendedTypeChecked` enables rules that require type information. We must ensure
// they only apply to TS files; otherwise ESLint will try to run them on JS config files
// (e.g. `postcss.config.js`) and error out due to missing parser services.
const typeCheckedConfigs = typescriptPlugin.configs.recommendedTypeChecked.map(
  (cfg) => ({
    ...cfg,
    files: TS_FILES,
  })
);

export default typescriptPlugin.config(
  js.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'storybook-static/**',
      // Not part of the TS build surface area (and may not be included in the project service).
      'hooks/**',
      'scripts/**',
      // Tooling config files (CJS) - avoid `no-undef` noise for `module`, etc.
      'postcss.config.js',
      'tailwind.config.js',
      'eslint.config.mjs',
      '**/*.d.ts',
    ],
  },
  ...typeCheckedConfigs,
  {
    files: TS_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        project: 'tsconfig.json',
      },
    },
    plugins: {
      import: importPlugin,
      '@typescript-eslint': typescriptPlugin.plugin,
    },
    rules: {
      'no-console': 'off',
      'no-useless-escape': 'warn',
      // Keep lint signal focused; SDK has lots of intentional assertions and Node boundary code.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
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
  }
);



