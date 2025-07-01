import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { MigrationsOrderByWithRelationInput } from "../../../inputs/MigrationsOrderByWithRelationInput";
import { MigrationsWhereInput } from "../../../inputs/MigrationsWhereInput";
import { MigrationsWhereUniqueInput } from "../../../inputs/MigrationsWhereUniqueInput";

@TypeGraphQL.ArgsType()
export class AggregateMigrationsArgs {
  @TypeGraphQL.Field(_type => MigrationsWhereInput, {
    nullable: true
  })
  where?: MigrationsWhereInput | undefined;

  @TypeGraphQL.Field(_type => [MigrationsOrderByWithRelationInput], {
    nullable: true
  })
  orderBy?: MigrationsOrderByWithRelationInput[] | undefined;

  @TypeGraphQL.Field(_type => MigrationsWhereUniqueInput, {
    nullable: true
  })
  cursor?: MigrationsWhereUniqueInput | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  take?: number | undefined;

  @TypeGraphQL.Field(_type => TypeGraphQL.Int, {
    nullable: true
  })
  skip?: number | undefined;
}
