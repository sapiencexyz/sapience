import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceCreateInput } from "../../../inputs/Resource_priceCreateInput";
import { Resource_priceUpdateInput } from "../../../inputs/Resource_priceUpdateInput";
import { Resource_priceWhereUniqueInput } from "../../../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpsertOneResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;

  @TypeGraphQL.Field(_type => Resource_priceCreateInput, {
    nullable: false
  })
  create!: Resource_priceCreateInput;

  @TypeGraphQL.Field(_type => Resource_priceUpdateInput, {
    nullable: false
  })
  update!: Resource_priceUpdateInput;
}
