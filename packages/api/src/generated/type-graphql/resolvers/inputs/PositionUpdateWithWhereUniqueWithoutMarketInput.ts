import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionUpdateWithoutMarketInput } from "../inputs/PositionUpdateWithoutMarketInput";
import { PositionWhereUniqueInput } from "../inputs/PositionWhereUniqueInput";

@TypeGraphQL.InputType("PositionUpdateWithWhereUniqueWithoutMarketInput", {})
export class PositionUpdateWithWhereUniqueWithoutMarketInput {
  @TypeGraphQL.Field(_type => PositionWhereUniqueInput, {
    nullable: false
  })
  where!: PositionWhereUniqueInput;

  @TypeGraphQL.Field(_type => PositionUpdateWithoutMarketInput, {
    nullable: false
  })
  data!: PositionUpdateWithoutMarketInput;
}
