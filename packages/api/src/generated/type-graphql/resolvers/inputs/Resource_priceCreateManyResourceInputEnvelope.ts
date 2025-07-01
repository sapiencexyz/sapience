import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { Prisma } from "../../../../../generated/prisma";
import { DecimalJSScalar } from "../../scalars";
import { Resource_priceCreateManyResourceInput } from "../inputs/Resource_priceCreateManyResourceInput";

@TypeGraphQL.InputType("Resource_priceCreateManyResourceInputEnvelope", {})
export class Resource_priceCreateManyResourceInputEnvelope {
  @TypeGraphQL.Field(_type => [Resource_priceCreateManyResourceInput], {
    nullable: false
  })
  data!: Resource_priceCreateManyResourceInput[];

  @TypeGraphQL.Field(_type => Boolean, {
    nullable: true
  })
  skipDuplicates?: boolean | undefined;
}
