// Export the main GraphQL types with proper aliases
export type { Market as MarketType } from './graphql';
export type { MarketGroup as MarketGroupType } from './graphql';
export type { Category as CategoryType } from './graphql';
export type { Position as PositionType } from './graphql';
export type { Transaction as TransactionType } from './graphql';
export type { Resource as ResourceType } from './graphql';

// Export other commonly used types from graphql
export type { Query, ResourcePrice, Transaction } from './graphql';
export type { CandleType } from './graphql';

// MAYBE DEPRECATED
export * from './charts';
export * from './MarketGroup';
export * from './Market';
export * from './resources';

