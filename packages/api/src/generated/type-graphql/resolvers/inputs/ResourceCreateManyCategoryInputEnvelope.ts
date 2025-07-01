import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { ResourceCreateManyCategoryInput } from "../inputs/ResourceCreateManyCategoryInput";

@TypeGraphQL.InputType("ResourceCreateManyCategoryInputEnvelope", {})
export class ResourceCreateManyCategoryInputEnvelope {
  @TypeGraphQL.Field(_type => [ResourceCreateManyCategoryInput], {
    nullable: false
  })
  data!: ResourceCreateManyCategoryInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
