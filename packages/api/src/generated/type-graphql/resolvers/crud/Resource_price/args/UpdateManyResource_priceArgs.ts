import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceUpdateManyMutationInput } from "../../../inputs/Resource_priceUpdateManyMutationInput";
import { Resource_priceWhereInput } from "../../../inputs/Resource_priceWhereInput";

@TypeGraphQL.ArgsType()
export class UpdateManyResource_priceArgs {
  @TypeGraphQL.Field(_type => Resource_priceUpdateManyMutationInput, {
    nullable: false
  })
  data!: Resource_priceUpdateManyMutationInput;

  @TypeGraphQL.Field(_type => Resource_priceWhereInput, {
    nullable: true
  })
  where?: Resource_priceWhereInput | undefined;
}
