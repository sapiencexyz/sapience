import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceWhereInput } from "../../inputs/Resource_priceWhereInput";

@TypeGraphQL.ArgsType()
export class ResourceCountResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  where?: Resource_priceWhereInput | undefined;
}
