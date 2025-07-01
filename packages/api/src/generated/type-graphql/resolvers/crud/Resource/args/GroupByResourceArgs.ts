import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceOrderByWithAggregationInput } from "../../../inputs/ResourceOrderByWithAggregationInput";
import { ResourceScalarWhereWithAggregatesInput } from "../../../inputs/ResourceScalarWhereWithAggregatesInput";
import { ResourceWhereInput } from "../../../inputs/ResourceWhereInput";
import { ResourceScalarFieldEnum } from "../../../../enums/ResourceScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByResourceArgs {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [ResourceOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: ResourceOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [ResourceScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "name" | "slug" | "categoryId">;

  @TypeGraphQL.Field(_type => ResourceScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: ResourceScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
