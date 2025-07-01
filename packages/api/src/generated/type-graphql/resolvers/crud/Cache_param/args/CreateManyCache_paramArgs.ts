import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_paramCreateManyInput } from "../../../inputs/Cache_paramCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyCache_paramArgs {
  @TypeGraphQL.Field(_type => [Cache_paramCreateManyInput], {
    nullable: false
  })
  data!: Cache_paramCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
