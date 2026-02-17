/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['<rootDir>/src/setupReactAct.js'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        jsxImportSource: 'react',
      }
    }]
  },
  moduleNameMapper: {
    // Handle CSS imports
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Handle path aliases
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    // graphql-request is ESM-only — must be transformed by ts-jest
    // pnpm hoists to .pnpm/ so we need to match the nested path
    'node_modules/(?!(\\.pnpm/graphql-request|graphql-request)/)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/',
    '\\.spec\\.ts$',
  ],
};
