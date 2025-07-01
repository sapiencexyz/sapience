import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyResourceInputEnvelope } from "../inputs/Market_groupCreateManyResourceInputEnvelope";
import { Market_groupCreateOrConnectWithoutResourceInput } from "../inputs/Market_groupCreateOrConnectWithoutResourceInput";
import { Market_groupCreateWithoutResourceInput } from "../inputs/Market_groupCreateWithoutResourceInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupCreateNestedManyWithoutResourceInput", {})
export class Market_groupCreateNestedManyWithoutResourceInput {
  @TypeGraphQL.Field(_type => [Market_groupCreateWithoutResourceInput], {
    nullable: true
  })
  create?: Market_groupCreateWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupCreateOrConnectWithoutResourceInput], {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateManyResourceInputEnvelope, {
    nullable: true
  })
  createMany?: Market_groupCreateManyResourceInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput[] | undefined;
}
