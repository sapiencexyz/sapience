import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./schema.graphql",
  generates: {
    // Generate types for the API package (server)
    "./src/graphql/types/generated.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useIndexSignature: true,
        contextType: "../startApolloServer#ApolloContext",
        mappers: {
          // Add mappers if needed based on your models
          MarketType: "../../models/Market#Market",
          MarketGroupType: "../../models/MarketGroup#MarketGroup",
          ResourceType: "../../models/Resource#Resource",
          CategoryType: "../../models/Category#Category",
          PositionType: "../../models/Position#Position",
          TransactionType: "../../models/Transaction#Transaction",
          ResourcePriceType: "../../models/ResourcePrice#ResourcePrice",
        },
      },
    },
    // Generate types for the UI package (client)
    "../ui/types/graphql.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: false,
        dedupeFragments: true,
        enumsAsTypes: true,
        exportFragmentSpreadSubTypes: true,
        skipTypename: false,
      },
    }
  },
};

export default config; 