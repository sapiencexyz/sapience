import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnResourceArgs } from "./args/CreateManyAndReturnResourceArgs";
import { Resource } from "../../../models/Resource";
import { CreateManyAndReturnResource } from "../../outputs/CreateManyAndReturnResource";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource)
export class CreateManyAndReturnResourceResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnResource], {
    nullable: false
  })
  async createManyAndReturnResource(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnResourceArgs): Promise<CreateManyAndReturnResource[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
