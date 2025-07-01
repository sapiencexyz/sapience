import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateOrConnectWithoutEventInput } from "../inputs/Market_groupCreateOrConnectWithoutEventInput";
import { Market_groupCreateWithoutEventInput } from "../inputs/Market_groupCreateWithoutEventInput";
import { Market_groupUpdateToOneWithWhereWithoutEventInput } from "../inputs/Market_groupUpdateToOneWithWhereWithoutEventInput";
import { Market_groupUpsertWithoutEventInput } from "../inputs/Market_groupUpsertWithoutEventInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpdateOneWithoutEventNestedInput", {})
export class Market_groupUpdateOneWithoutEventNestedInput {
  @TypeGraphQL.Field(_type => Market_groupCreateWithoutEventInput, {
    nullable: true
  })
  create?: Market_groupCreateWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateOrConnectWithoutEventInput, {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpsertWithoutEventInput, {
    nullable: true
  })
  upsert?: Market_groupUpsertWithoutEventInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  disconnect?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  delete?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupWhereUniqueInput, {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateToOneWithWhereWithoutEventInput, {
    nullable: true
  })
  update?: Market_groupUpdateToOneWithWhereWithoutEventInput | undefined;
}
