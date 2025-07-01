import * as TypeGraphQL from "type-graphql";

export enum MigrationsScalarFieldEnum {
  id = "id",
  timestamp = "timestamp",
  name = "name"
}
TypeGraphQL.registerEnumType(MigrationsScalarFieldEnum, {
  name: "MigrationsScalarFieldEnum",
  description: undefined,
});
