import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { ResourceOrderByWithRelationInput } from "../../../inputs/ResourceOrderByWithRelationInput";
import { ResourceWhereInput } from "../../../inputs/ResourceWhereInput";
import { ResourceWhereUniqueInput } from "../../../inputs/ResourceWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateResourceArgs {
  @TypeGraphQL.Field(_type => ResourceWhereInput, {
    nullable: true
  })
  where?: ResourceWhereInput | undefined;

  @TypeGraphQL.Field(_type => [ResourceOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: ResourceOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => ResourceWhereUniqueInput, {
    nullable: true
  })
  cursor?: ResourceWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
