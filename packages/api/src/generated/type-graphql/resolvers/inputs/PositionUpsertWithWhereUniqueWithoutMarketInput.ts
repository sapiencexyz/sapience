import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateWithoutMarketInput } from "../inputs/PositionCreateWithoutMarketInput";
import { PositionUpdateWithoutMarketInput } from "../inputs/PositionUpdateWithoutMarketInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionUpsertWithWhereUniqueWithoutMarketInput", {})
export class PositionUpsertWithWhereUniqueWithoutMarketInput {
  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;

  @TypeGraphQL.Field(_type => PositionUpdateWithoutMarketInput, {
    nullable: false
  })
  update!: PositionUpdateWithoutMarketInput;

  @TypeGraphQL.Field(_type => PositionCreateWithoutMarketInput, {
    nullable: false
  })
  create!: PositionCreateWithoutMarketInput;
}
