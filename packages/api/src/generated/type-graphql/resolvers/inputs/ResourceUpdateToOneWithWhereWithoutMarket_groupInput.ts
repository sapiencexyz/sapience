import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceUpdateWithoutMarket_groupInput } from "../inputs/ResourceUpdateWithoutMarket_groupInput";
import { ResourceWhereInput } from "../inputs/ResourceWhereInput";

@TypeGraphQL.InputType("ResourceUpdateToOneWithWhereWithoutMarket_groupInput", {})
export class ResourceUpdateToOneWithWhereWithoutMarket_groupInput {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => ResourceUpdateWithoutMarket_groupInput, {
    nullable: false
  })
  data!: ResourceUpdateWithoutMarket_groupInput;
}
