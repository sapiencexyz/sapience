import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnEventArgs } from "./args/CreateManyAndReturnEventArgs";
import { Event } from "../../../models/Event";
import { CreateManyAndReturnEvent } from "../../outputs/CreateManyAndReturnEvent";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Event)
export class CreateManyAndReturnEventResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnEvent], {
    nullable: false
  })
  async createManyAndReturnEvent(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnEventArgs): Promise<CreateManyAndReturnEvent[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).event.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
