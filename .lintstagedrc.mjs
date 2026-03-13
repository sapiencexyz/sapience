/** @type {import('lint-staged').Config} */
export default {
  // App — uses --max-warnings=0 (strictest package)
  'packages/app/src/**/*.{js,jsx,ts,tsx}': (files) => [
    `cd packages/app && npx eslint --fix --max-warnings=0 ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // API
  'packages/api/src/**/*.{js,ts}': (files) => [
    `cd packages/api && npx eslint --fix --quiet ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // SDK
  'packages/sdk/**/*.{js,ts}': (files) => [
    `cd packages/sdk && npx eslint --fix --quiet ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // UI
  'packages/ui/**/*.{js,jsx,ts,tsx}': (files) => [
    `cd packages/ui && npx eslint --fix --quiet ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Relayer
  'packages/relayer/src/**/*.{js,ts}': (files) => [
    `cd packages/relayer && npx eslint --fix --quiet ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Market Keeper
  'packages/market-keeper/src/**/*.{js,ts}': (files) => [
    `cd packages/market-keeper && npx eslint --fix --quiet ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Protocol — Solidity files
  'packages/protocol/**/*.sol': (files) => [
    `cd packages/protocol && forge fmt ${files.join(' ')}`,
  ],

  // Non-code files across all packages and root
  '**/*.{json,css,scss,md,mdx}': ['prettier --write'],
};
