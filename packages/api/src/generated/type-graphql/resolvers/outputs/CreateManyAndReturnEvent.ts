import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CreateManyAndReturnEventMarket_groupArgs } from "./args/CreateManyAndReturnEventMarket_groupArgs";
import { Market_group } from "../../models/Market_group";

@TypeGraphQL.ObjectType("CreateManyAndReturnEvent", {})
export class CreateManyAndReturnEvent {
  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  id!: number;

  @TypeGraphQL.Field(_type => Date, {
    nullable: false
  })
  createdAt!: Date;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  blockNumber!: number;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  transactionHash!: string;

  @TypeGraphQL.Field(_type => GraphQLScalars.BigIntResolver, {
    nullable: false
  })
  timestamp!: bigint;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: false
  })
  logIndex!: number;

  @TypeGraphQL.Field(_type => GraphQLScalars.JSONResolver, {
    nullable: false
  })
  logData!: Prisma.JsonValue;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  marketGroupId!: number | null;

  market_group!: Market_group | null;

  @TypeGraphQL.Field(_type => Market_group, {
    name: "market_group",
    nullable: true
  })
  getMarket_group(@TypeGraphQL.Root() root: CreateManyAndReturnEvent, @TypeGraphQL.Args() args: CreateManyAndReturnEventMarket_groupArgs): Market_group | null {
    return root.market_group;
  }
}
