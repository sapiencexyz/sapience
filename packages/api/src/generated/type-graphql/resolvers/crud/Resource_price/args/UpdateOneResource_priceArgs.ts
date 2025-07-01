import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceUpdateInput } from "../../../inputs/Resource_priceUpdateInput";
import { Resource_priceWhereUniqueInput } from "../../../inputs/Resource_priceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class UpdateOneResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceUpdateInput, {
    nullable: false
  })
  data!: Resource_priceUpdateInput;

  @TypeGraphQL.Field(_type => Resource_priceWhereUniqueInput, {
    nullable: false
  })
  where!: Resource_priceWhereUniqueInput;
}
