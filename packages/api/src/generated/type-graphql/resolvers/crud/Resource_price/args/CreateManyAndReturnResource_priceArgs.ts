import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Resource_priceCreateManyInput } from "../../../inputs/Resource_priceCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnResource_priceArgs {
  @TypeGraphQL.Field(_type => [Resource_priceCreateManyInput], {
    nullable: false
  })
  data!: Resource_priceCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
