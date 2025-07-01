import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutEventInput } from "../inputs/Market_groupCreateWithoutEventInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateOrConnectWithoutEventInput", {})
export class Market_groupCreateOrConnectWithoutEventInput {
  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: false
  })
  where!: Market_groupWhereUniqueInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutEventInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutEventInput;
}
