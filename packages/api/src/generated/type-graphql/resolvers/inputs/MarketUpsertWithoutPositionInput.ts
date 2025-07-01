import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { MarketCreateWithoutPositionInput } from "../inputs/MarketCreateWithoutPositionInput";
import { MarketUpdateWithoutPositionInput } from "../inputs/MarketUpdateWithoutPositionInput";
import { MarketWhereInput } from "../inputs/MarketWhereInput";

@TypeGraphQL.InputType("MarketUpsertWithoutPositionInput", {})
export class MarketUpsertWithoutPositionInput {
  @TypeGraphQL.Field(_type => MarketUpdateWithoutPositionInput, {
    nullable: false
  })
  update!: MarketUpdateWithoutPositionInput;

  @TypeGraphQL.Field(_type => MarketCreateWithoutPositionInput, {
    nullable: false
  })
  create!: MarketCreateWithoutPositionInput;

  @TypeGraphQL.Field(_type => MarketWhereInput, {
    nullable: true
  })
  where?: MarketWhereInput | undefined;
}
