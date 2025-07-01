import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { TransactionWhereInput } from "../../inputs/TransactionWhereInput";

@TypeGraphQL.ArgsType()
export class PositionCountTransactionArgs {
  @TypeGraphQL.Field(_type => TransactionWhereInput, {
    nullable: true
  })
  where?: TransactionWhereInput | undefined;
}
