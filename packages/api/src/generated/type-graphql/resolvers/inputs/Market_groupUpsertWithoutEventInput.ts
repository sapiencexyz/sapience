import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateWithoutEventInput } from "../inputs/Market_groupCreateWithoutEventInput";
import { Market_groupUpdateWithoutEventInput } from "../inputs/Market_groupUpdateWithoutEventInput";
import { Market_groupWhereInput } from "../inputs/Market_groupWhereInput";

@TypeGraphQL.InputType("Market_groupUpsertWithoutEventInput", {})
export class Market_groupUpsertWithoutEventInput {
  @TypeGraphQL.Field(_type => Market_groupUpdateWithoutEventInput, {
    nullable: false
  })
  update!: Market_groupUpdateWithoutEventInput;

  @TypeGraphQL.Field(_type => Market_groupCreateWithoutEventInput, {
    nullable: false
  })
  create!: Market_groupCreateWithoutEventInput;

  @TypeGraphQL.Field(_type => Market_groupWhereInput, {
    nullable: true
  })
  where?: Market_groupWhereInput | undefined;
}
