import '@testing-library/jest-dom/vitest';

// Enable React act() environment for React 19
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
