import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { PositionCreateManyMarketInput } from "../inputs/PositionCreateManyMarketInput";

@TypeGraphQL.InputType("PositionCreateManyMarketInputEnvelope", {})
export class PositionCreateManyMarketInputEnvelope {
  @TypeGraphQL.Field(_type => [PositionCreateManyMarketInput], {
    nullable: false
  })
  data!: PositionCreateManyMarketInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
