import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateOrConnectWithoutEventInput } from "../inputs/Market_groupCreateOrConnectWithoutEventInput";
import { Market_groupCreateWithoutEventInput } from "../inputs/Market_groupCreateWithoutEventInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateNestedOneWithoutEventInput", {})
export class Market_groupCreateNestedOneWithoutEventInput {
  @TypeGraphQL.Field(_type => Market_groupCreateWithoutEventInput, {
    nullable: true
  })
  create?: Market_groupCreateWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateOrConnectWithoutEventInput, {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput | undefined;
}
