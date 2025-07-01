import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupScalarWhereInput } from "../inputs/Market_groupScalarWhereInput";
import { Market_groupUpdateManyMutationInput } from "../inputs/Market_groupUpdateManyMutationInput";

@TypeGraphQL.InputType("Market_groupUpdateManyWithWhereWithoutCategoryInput", {})
export class Market_groupUpdateManyWithWhereWithoutCategoryInput {
  @TypeGraphQL.Field(_type => Market_groupScalarWhereInput, {
    nullable: false
  })
  where!: Market_groupScalarWhereInput;

  @TypeGraphQL.Field(_type => Market_groupUpdateManyMutationInput, {
    nullable: false
  })
  data!: Market_groupUpdateManyMutationInput;
}
