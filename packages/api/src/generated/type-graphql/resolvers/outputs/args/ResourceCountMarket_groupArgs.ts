import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupWhereInput } from "../../inputs/Market_groupWhereInput";

@TypeGraphQL.ArgsType()
export class ResourceCountMarket_groupArgs {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;
}
