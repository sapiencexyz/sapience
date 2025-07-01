import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Market_groupCreateManyInput } from "../../../inputs/Market_groupCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnMarket_groupArgs {
  @TypeGraphQL.Field(_type => [Market_groupCreateManyInput], {
    nullable: false
  })
  data!: Market_groupCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
