import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateManyMarketInputEnvelope } from "../inputs/PositionCreateManyMarketInputEnvelope";
import { PositionCreateOrConnectWithoutMarketInput } from "../inputs/PositionCreateOrConnectWithoutMarketInput";
import { PositionCreateWithoutMarketInput } from "../inputs/PositionCreateWithoutMarketInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionCreateNestedManyWithoutMarketInput", {})
export class PositionCreateNestedManyWithoutMarketInput {
  @TypeGraphQL.Field(_type => [PositionCreateWithoutMarketInput], {
    nullable: true
  })
  create?: PositionCreateWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => [PositionCreateOrConnectWithoutMarketInput], {
    nullable: true
  })
  connectOrCreate?: PositionCreateOrConnectWithoutMarketInput[] | undefined;

  @TypeGraphQL.Field(_type => PositionCreateManyMarketInputEnvelope, {
    nullable: true
  })
  createMany?: PositionCreateManyMarketInputEnvelope | undefined;

  @TypeGraphQL.Field(_type => [PositionWhereUniqueInput], {
    nullable: true
  })
  connect?: PositionWhereUniqueInput[] | undefined;
}
