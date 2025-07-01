import * as TypeGraphQL from "type-graphql";

export enum transaction_type_enum {
  addLiquidity = "addLiquidity",
  removeLiquidity = "removeLiquidity",
  long = "long",
  short = "short",
  settledPosition = "settledPosition"
}
TypeGraphQL.registerEnumType(transaction_type_enum, {
  name: "transaction_type_enum",
  description: undefined,
});
