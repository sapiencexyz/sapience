import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Market_groupCreateManyResourceInput } from "../inputs/Market_groupCreateManyResourceInput";

@TypeGraphQL.InputType("Market_groupCreateManyResourceInputEnvelope", {})
export class Market_groupCreateManyResourceInputEnvelope {
  @TypeGraphQL.Field(_type => [Market_groupCreateManyResourceInput], {
    nullable: false
  })
  data!: Market_groupCreateManyResourceInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
