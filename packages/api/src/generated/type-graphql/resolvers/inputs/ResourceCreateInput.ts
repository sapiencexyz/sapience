import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateNestedOneWithoutResourceInput } from "../inputs/CategoryCreateNestedOneWithoutResourceInput";
import { Market_groupCreateNestedManyWithoutResourceInput } from "../inputs/Market_groupCreateNestedManyWithoutResourceInput";
import { Resource_priceCreateNestedManyWithoutResourceInput } from "../inputs/Resource_priceCreateNestedManyWithoutResourceInput";

@TypeGraphQL.InputType("ResourceCreateInput", {})
export class ResourceCreateInput {
  @TypeGraphQL.Field(_type => Date, {
    nullable: true
  })
  createdAt?: Date | undefined;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  name!: string;

  @TypeGraphQL.Field(_type => String, {
    nullable: false
  })
  slug!: string;

  @TypeGraphQL.Field(_type => Market_groupCreateNestedManyWithoutResourceInput, {
    nullable: true
  })
  market_group?: Market_groupCreateNestedManyWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => CategoryCreateNestedOneWithoutResourceInput, {
    nullable: true
  })
  category?: CategoryCreateNestedOneWithoutResourceInput | undefined;

  @TypeGraphQL.Field(_type => Resource_priceCreateNestedManyWithoutResourceInput, {
    nullable: true
  })
  resource_price?: Resource_priceCreateNestedManyWithoutResourceInput | undefined;
}
