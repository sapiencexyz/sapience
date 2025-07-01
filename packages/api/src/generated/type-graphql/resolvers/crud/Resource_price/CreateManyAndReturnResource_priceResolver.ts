import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnResource_priceArgs } from "./args/CreateManyAndReturnResource_priceArgs";
import { Resource_price } from "../../../models/Resource_price";
import { CreateManyAndReturnResource_price } from "../../outputs/CreateManyAndReturnResource_price";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Resource_price)
export class CreateManyAndReturnResource_priceResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnResource_price], {
    nullable: false
  })
  async createManyAndReturnResource_price(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnResource_priceArgs): Promise<CreateManyAndReturnResource_price[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).resource_price.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
