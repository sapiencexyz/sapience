import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { PositionCreateManyInput } from "../../../inputs/PositionCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyPositionArgs {
  @TypeGraphQL.Field(_type => [PositionCreateManyInput], {
    nullable: false
  })
  data!: PositionCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
