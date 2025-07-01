import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateNestedOneWithoutEventInput } from "../inputs/Market_groupCreateNestedOneWithoutEventInput";

@TypeGraphQL.InputType("EventCreateWithoutTransactionInput", {})
export class EventCreateWithoutTransactionInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

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
  logData!: Prisma.InputJsonValue;

  @TypeGraphQL.Field(_type => Market_groupCreateNestedOneWithoutEventInput, {
    nullable: true
  })
  market_group?: Market_groupCreateNestedOneWithoutEventInput | undefined;
}
