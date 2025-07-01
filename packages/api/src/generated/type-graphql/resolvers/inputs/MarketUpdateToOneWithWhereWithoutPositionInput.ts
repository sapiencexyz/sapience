import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketUpdateWithoutPositionInput } from "../inputs/MarketUpdateWithoutPositionInput";
import { MarketWhereInput } from "../inputs/MarketWhereInput";

@TypeGraphQL.InputType("MarketUpdateToOneWithWhereWithoutPositionInput", {})
export class MarketUpdateToOneWithWhereWithoutPositionInput {
  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;

  @TypeGraphQL.Field(_type => MarketUpdateWithoutPositionInput, {
    nullable: false
  })
  data!: MarketUpdateWithoutPositionInput;
}
