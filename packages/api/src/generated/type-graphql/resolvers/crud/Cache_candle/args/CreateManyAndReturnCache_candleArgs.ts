import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Cache_candleCreateManyInput } from "../../../inputs/Cache_candleCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyAndReturnCache_candleArgs {
  @TypeGraphQL.Field(_type => [Cache_candleCreateManyInput], {
    nullable: false
  })
  data!: Cache_candleCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
