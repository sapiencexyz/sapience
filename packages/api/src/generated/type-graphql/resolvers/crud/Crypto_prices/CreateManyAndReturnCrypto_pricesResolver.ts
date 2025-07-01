import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnCrypto_pricesArgs } from "./args/CreateManyAndReturnCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { CreateManyAndReturnCrypto_prices } from "../../outputs/CreateManyAndReturnCrypto_prices";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class CreateManyAndReturnCrypto_pricesResolver {
  @TypeGraphQL.Mutation(_returns => [CreateManyAndReturnCrypto_prices], {
    nullable: false
  })
  async createManyAndReturnCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: CreateManyAndReturnCrypto_pricesArgs): Promise<CreateManyAndReturnCrypto_prices[]> {
    const { _count } = transformInfoIntoPrismaArgs(info);
    return getPrismaFromContext(ctx).crypto_prices.createManyAndReturn({
      ...args,
      ...(_count && transformCountFieldIntoSelectRelationsCount(_count)),
    });
  }
}
