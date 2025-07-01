import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyResourceInputEnvelope } from "../inputs/Market_groupCreateManyResourceInputEnvelope";
import { Market_groupCreateOrConnectWithoutResourceInput } from "../inputs/Market_groupCreateOrConnectWithoutResourceInput";
import { Market_groupCreateWithoutResourceInput } from "../inputs/Market_groupCreateWithoutResourceInput";
import { Market_groupScalarWhereInput } from "../inputs/Market_groupScalarWhereInput";
import { Market_groupUpdateManyWithWhereWithoutResourceInput } from "../inputs/Market_groupUpdateManyWithWhereWithoutResourceInput";
import { Market_groupUpdateWithWhereUniqueWithoutResourceInput } from "../inputs/Market_groupUpdateWithWhereUniqueWithoutResourceInput";
import { Market_groupUpsertWithWhereUniqueWithoutResourceInput } from "../inputs/Market_groupUpsertWithWhereUniqueWithoutResourceInput";
import { Market_groupWhereUniqueInput } from "../inputs/Market_groupWhereUniqueInput";

@TypeGraphQL.InputType("Market_groupUpdateManyWithoutResourceNestedInput", {})
export class Market_groupUpdateManyWithoutResourceNestedInput {
  @TypeGraphQL.Field(_type => [Market_groupCreateWithoutResourceInput], {
    nullable: true
  })
  create?: Market_groupCreateWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupCreateOrConnectWithoutResourceInput], {
    nullable: true
  })
  connectOrCreate?: Market_groupCreateOrConnectWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpsertWithWhereUniqueWithoutResourceInput], {
    nullable: true
  })
  upsert?: Market_groupUpsertWithWhereUniqueWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => Market_groupCreateManyResourceInputEnvelope, {
    nullable: true
  })
  createMany?: Market_groupCreateManyResourceInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  set?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  disconnect?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  delete?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupWhereUniqueInput], {
    nullable: true
  })
  connect?: Market_groupWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpdateWithWhereUniqueWithoutResourceInput], {
    nullable: true
  })
  update?: Market_groupUpdateWithWhereUniqueWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupUpdateManyWithWhereWithoutResourceInput], {
    nullable: true
  })
  updateMany?: Market_groupUpdateManyWithWhereWithoutResourceInput[] | undefined;

  @TypeGraphQL.Field(_type => [Market_groupScalarWhereInput], {
    nullable: true
  })
  deleteMany?: Market_groupScalarWhereInput[] | undefined;
}
