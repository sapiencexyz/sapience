import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { CategoryCreateNestedOneWithoutResourceInput } from "../inputs/CategoryCreateNestedOneWithoutResourceInput";
import { Market_groupCreateNestedManyWithoutResourceInput } from "../inputs/Market_groupCreateNestedManyWithoutResourceInput";

@TypeGraphQL.InputType("ResourceCreateWithoutResource_priceInput", {})
export class ResourceCreateWithoutResource_priceInput {
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
}
