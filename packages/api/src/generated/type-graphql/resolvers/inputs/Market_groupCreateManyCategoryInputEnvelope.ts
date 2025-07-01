import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyCategoryInput } from "../inputs/Market_groupCreateManyCategoryInput";

@TypeGraphQL.InputType("Market_groupCreateManyCategoryInputEnvelope", {})
export class Market_groupCreateManyCategoryInputEnvelope {
  @TypeGraphQL.Field(_type => [Market_groupCreateManyCategoryInput], {
    nullable: false
  })
  data!: Market_groupCreateManyCategoryInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
