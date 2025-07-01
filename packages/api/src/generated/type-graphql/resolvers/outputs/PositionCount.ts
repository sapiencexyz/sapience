import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCountTransactionArgs } from "./args/PositionCountTransactionArgs";

@TypeGraphQL.ObjectType("PositionCount", {})
export class PositionCount {
  transaction!: number;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    name: "transaction",
    nullable: false
  })
  getTransaction(@TypeGraphQL.Root() root: PositionCount, @TypeGraphQL.Args() args: PositionCountTransactionArgs): number {
    return root.transaction;
  }
}
