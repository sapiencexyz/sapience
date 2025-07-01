import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateManyMarketInputEnvelope } from "../inputs/PositionCreateManyMarketInputEnvelope";
import { PositionCreateOrConnectWithoutMarketInput } from "../inputs/PositionCreateOrConnectWithoutMarketInput";
import { PositionCreateWithoutMarketInput } from "../inputs/PositionCreateWithoutMarketInput";
import { PositionScalarWhereInput } from "../inputs/PositionScalarWhereInput";
import { PositionUpdateManyWithWhereWithoutMarketInput } from "../inputs/PositionUpdateManyWithWhereWithoutMarketInput";
import { PositionUpdateWithWhereUniqueWithoutMarketInput } from "../inputs/PositionUpdateWithWhereUniqueWithoutMarketInput";
import { PositionUpsertWithWhereUniqueWithoutMarketInput } from "../inputs/PositionUpsertWithWhereUniqueWithoutMarketInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionUpdateManyWithoutMarketNestedInput", {})
export class PositionUpdateManyWithoutMarketNestedInput {
  @TypeGraphQL.Field(_type => [PositionCreateWithoutMarketInput], {
    nullable: true
  })
  create?: PositionCreateWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionCreateOrConnectWithoutMarketInput], {
    nullable: true
  })
  connectOrCreate?: PositionCreateOrConnectWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionUpsertWithWhereUniqueWithoutMarketInput], {
    nullable: true
  })
  upsert?: PositionUpsertWithWhereUniqueWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => PositionCreateManyMarketInputEnvelope, {
    nullable: true
  })
  createMany?: PositionCreateManyMarketInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereUniqueInput], {
    nullable: true
  })
  set?: PositionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereUniqueInput], {
    nullable: true
  })
  disconnect?: PositionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereUniqueInput], {
    nullable: true
  })
  delete?: PositionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereUniqueInput], {
    nullable: true
  })
  connect?: PositionWhereUniqueInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionUpdateWithWhereUniqueWithoutMarketInput], {
    nullable: true
  })
  update?: PositionUpdateWithWhereUniqueWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionUpdateManyWithWhereWithoutMarketInput], {
    nullable: true
  })
  updateMany?: PositionUpdateManyWithWhereWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionScalarWhereInput], {
    nullable: true
  })
  deleteMany?: PositionScalarWhereInput[] | undefined;
}
