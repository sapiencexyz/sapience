import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutResourceInput } from "../inputs/Market_groupCreateWithoutResourceInput";
import { Market_groupUpdateWithoutResourceInput } from "../inputs/Market_groupUpdateWithoutResourceInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpsertWithWhereUniqueWithoutResourceInput", {})
export class Market_groupUpsertWithWhereUniqueWithoutResourceInput {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutResourceInput, {
    nullable: false
  })
  update!: Market_groupUpdateWithoutResourceInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutResourceInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutResourceInput;
}
