import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MigrationsAvgOrderByAggregateInput } from "../inputs/MigrationsAvgOrderByAggregateInput";
import { MigrationsCountOrderByAggregateInput } from "../inputs/MigrationsCountOrderByAggregateInput";
import { MigrationsMaxOrderByAggregateInput } from "../inputs/MigrationsMaxOrderByAggregateInput";
import { MigrationsMinOrderByAggregateInput } from "../inputs/MigrationsMinOrderByAggregateInput";
import { MigrationsSumOrderByAggregateInput } from "../inputs/MigrationsSumOrderByAggregateInput";
import { SortOrder } from "../../enums/SortOrder";

@TypeGraphQL.InputType("MigrationsOrderByWithAggregationInput", {})
export class MigrationsOrderByWithAggregationInput {
  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  id?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  timestamp?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => SortOrder, {
    nullable: true
  })
  name?: "asc" | "desc" | undefined;

  @TypeGraphQL.Field(_type => MigrationsCountOrderByAggregateInput, {
    nullable: true
  })
  _count?: MigrationsCountOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MigrationsAvgOrderByAggregateInput, {
    nullable: true
  })
  _avg?: MigrationsAvgOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MigrationsMaxOrderByAggregateInput, {
    nullable: true
  })
  _max?: MigrationsMaxOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MigrationsMinOrderByAggregateInput, {
    nullable: true
  })
  _min?: MigrationsMinOrderByAggregateInput | undefined;

  @TypeGraphQL.Field(_type => MigrationsSumOrderByAggregateInput, {
    nullable: true
  })
  _sum?: MigrationsSumOrderByAggregateInput | undefined;
}
