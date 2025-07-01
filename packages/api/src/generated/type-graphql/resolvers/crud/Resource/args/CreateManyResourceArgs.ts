import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceCreateManyInput } from "../../../inputs/ResourceCreateManyInput";

@TypeGraphQL.ArgsType()
export class CreateManyResourceArgs {
  @TypeGraphQL.Field(_type => [ResourceCreateManyInput], {
    nullable: false
  })
  data!: ResourceCreateManyInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
