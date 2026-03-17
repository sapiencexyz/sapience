/** @type {import('lint-staged').Config} */
export default {
  // App — uses --max-warnings=0 (strictest package)
  // Filter out test files since eslint ignores them (*.test.ts) and the
  // "File ignored" message counts as a warning under --max-warnings=0.
  'packages/app/src/**/*.{js,jsx,ts,tsx}': (files) => {
    const nonTest = files.filter((f) => !f.includes('.test.'));
    return [
      ...(nonTest.length > 0
        ? [`bash -c 'cd packages/app && npx eslint --fix --max-warnings=0 ${nonTest.join(' ')}'`]
        : []),
      `prettier --write ${files.join(' ')}`,
    ];
  },

  // API
  'packages/api/src/**/*.{js,ts}': (files) => [
    `bash -c 'cd packages/api && npx eslint --fix --quiet ${files.join(' ')}'`,
    `prettier --write ${files.join(' ')}`,
  ],

  // SDK
  'packages/sdk/**/*.{js,ts}': (files) => [
    `bash -c 'cd packages/sdk && npx eslint --fix --quiet ${files.join(' ')}'`,
    `prettier --write ${files.join(' ')}`,
  ],

  // UI
  'packages/ui/**/*.{js,jsx,ts,tsx}': (files) => [
    `bash -c 'cd packages/ui && npx eslint --fix --quiet ${files.join(' ')}'`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Relayer
  'packages/relayer/src/**/*.{js,ts}': (files) => [
    `bash -c 'cd packages/relayer && npx eslint --fix --quiet ${files.join(' ')}'`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Market Keeper
  'packages/market-keeper/src/**/*.{js,ts}': (files) => [
    `bash -c 'cd packages/market-keeper && npx eslint --fix --quiet ${files.join(' ')}'`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Protocol — Solidity files
  'packages/protocol/**/*.sol': (files) => [
    `bash -c 'cd packages/protocol && forge fmt ${files.join(' ')}'`,
  ],

  // Non-code files across all packages and root
  '**/*.{json,css,scss,md,mdx}': ['prettier --write'],
};
