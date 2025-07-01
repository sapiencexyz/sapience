import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { TransactionCreateManyPositionInput } from "../inputs/TransactionCreateManyPositionInput";

@TypeGraphQL.InputType("TransactionCreateManyPositionInputEnvelope", {})
export class TransactionCreateManyPositionInputEnvelope {
  @TypeGraphQL.Field(_type => [TransactionCreateManyPositionInput], {
    nullable: false
  })
  data!: TransactionCreateManyPositionInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
