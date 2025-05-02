# GraphQL Types

This directory contains TypeScript type definitions for our application, including automatically generated GraphQL types.

## Generated GraphQL Types

The `graphql.ts` file contains automatically generated TypeScript types that correspond to our GraphQL schema. These types are generated from the API package's GraphQL schema and should not be modified directly.

### Updating GraphQL Types

When the GraphQL schema in the API package changes, you need to regenerate the types:

```bash
cd packages/api
pnpm generate-types
```

This will:
1. Read the GraphQL schema from `packages/api/schema.graphql`
2. Generate server-side types in `packages/api/src/graphql/types/generated.ts`
3. Generate client-side types in `packages/ui/types/graphql.ts`

## Using GraphQL Types in Components

You can import these types directly in your components:

```typescript
import { MarketType, MarketGroupType } from '@foil/ui/types';

// Use them in your component props
interface MyComponentProps {
  market: MarketType;
  marketGroups: MarketGroupType[];
}
```

## Best Practices

1. Always use the generated types when working with GraphQL data
2. If you need to extend or modify a type, create a new type that references the generated one
3. Run `generate-types` after any changes to the GraphQL schema
4. Include GraphQL type generation in your CI/CD pipeline to ensure types are always in sync 