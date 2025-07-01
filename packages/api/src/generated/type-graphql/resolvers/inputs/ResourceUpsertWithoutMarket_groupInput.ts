import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateWithoutMarket_groupInput } from "../inputs/ResourceCreateWithoutMarket_groupInput";
import { ResourceUpdateWithoutMarket_groupInput } from "../inputs/ResourceUpdateWithoutMarket_groupInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceUpsertWithoutMarket_groupInput", {})
export class ResourceUpsertWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => ResourceUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  update!: ResourceUpdateWithoutMarket_groupInput;

  @TypeGraphQL.Field(_type => ResourceCreateWithoutMarket_groupInput, {
    nullable: false
  })
  create!: ResourceCreateWithoutMarket_groupInput;

  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;
}
