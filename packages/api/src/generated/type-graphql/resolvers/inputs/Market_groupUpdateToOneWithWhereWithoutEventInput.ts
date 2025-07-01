import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupUpdateWithoutEventInput } from "../inputs/Market_groupUpdateWithoutEventInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupUpdateToOneWithWhereWithoutEventInput", {})
export class Market_groupUpdateToOneWithWhereWithoutEventInput {
  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;

  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutEventInput, {
    nullable: false
  })
  data!: Market_groupUpdateWithoutEventInput;
}
