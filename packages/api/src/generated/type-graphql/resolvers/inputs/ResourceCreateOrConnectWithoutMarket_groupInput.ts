import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutMarket_groupInput } from "../inputs/ResourceCreateWithoutMarket_groupInput";
import { ResourceWhereUniqueInput } from "../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.InputType("ResourceCreateOrConnectWithoutMarket_groupInput", {})
export class ResourceCreateOrConnectWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: false
  })
  where!: ResourceWhereUniqueInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutMarket_groupInput;
}
