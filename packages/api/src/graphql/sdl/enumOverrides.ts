/**
 * Hand-written TS enums for GraphQL enums that intentionally carry
 * both canonical and legacy-cased members so older clients keep
 * working through a deprecation window. graphql-codegen's default
 * PascalCase transformation collides on the two casings (e.g.
 * `CREATED_AT` and `createdAt` both become `CreatedAt`), so the
 * affected enums are mapped to this file via codegen-resolvers.ts.
 *
 * Wire values match the SDL exactly; the canonical members keep
 * their PascalCase TS names so existing resolver references like
 * `SortOrder.Asc` and `PositionSortField.CreatedAt` compile unchanged.
 */

export enum PredictionSortField {
  CreatedAt = 'CREATED_AT',
  SettledAt = 'SETTLED_AT',
  CreatedAtLegacy = 'createdAt',
  SettledAtLegacy = 'settledAt',
}

export enum PositionSortField {
  CreatedAt = 'CREATED_AT',
  UpdatedAt = 'UPDATED_AT',
  CreatedAtLegacy = 'createdAt',
  UpdatedAtLegacy = 'updatedAt',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
  AscLegacy = 'ASC',
  DescLegacy = 'DESC',
}

export enum OrderDirection {
  Asc = 'ASC',
  Desc = 'DESC',
  AscLegacy = 'asc',
  DescLegacy = 'desc',
}
