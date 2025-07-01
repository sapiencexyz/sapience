import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramOrderByWithAggregationInput } from "../../../inputs/Cache_paramOrderByWithAggregationInput";
import { Cache_paramScalarWhereWithAggregatesInput } from "../../../inputs/Cache_paramScalarWhereWithAggregatesInput";
import { Cache_paramWhereInput } from "../../../inputs/Cache_paramWhereInput";
import { Cache_paramScalarFieldEnum } from "../../../../enums/Cache_paramScalarFieldEnum";

@TypeGraphQL.ArgsType()
export class GroupByCache_paramArgs {
  @TypeGraphQL.Field(_type => Cache_paramWhereInput, {
    nullable: true
  })
  where?: Cache_paramWhereInput | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramOrderByWithAggregationInput], {
    nullable: true
  })
  orderBy?: Cache_paramOrderByWithAggregationInput[] | undefined;

  @TypeGraphQL.Field(_type => [Cache_paramScalarFieldEnum], {
    nullable: false
  })
  by!: Array<"id" | "createdAt" | "paramName" | "paramValueNumber" | "paramValueString">;

  @TypeGraphQL.Field(_type => Cache_paramScalarWhereWithAggregatesInput, {
    nullable: true
  })
  having?: Cache_paramScalarWhereWithAggregatesInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
