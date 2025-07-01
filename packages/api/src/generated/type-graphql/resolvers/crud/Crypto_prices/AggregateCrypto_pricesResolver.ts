import * as TypeGraphQL from "type-graphql";
import type { GraphQLResolveInfo } from "graphql";
import { AggregateCrypto_pricesArgs } from "./args/AggregateCrypto_pricesArgs";
import { Crypto_prices } from "../../../models/Crypto_prices";
import { AggregateCrypto_prices } from "../../outputs/AggregateCrypto_prices";
import { transformInfoIntoPrismaArgs, getPrismaFromContext, transformCountFieldIntoSelectRelationsCount } from "../../../helpers";

@TypeGraphQL.Resolver(_of => Crypto_prices)
export class AggregateCrypto_pricesResolver {
  @TypeGraphQL.Query(_returns => AggregateCrypto_prices, {
    nullable: false
  })
  async aggregateCrypto_prices(@TypeGraphQL.Ctx() ctx: any, @TypeGraphQL.Info() info: GraphQLResolveInfo, @TypeGraphQL.Args() args: AggregateCrypto_pricesArgs): Promise<AggregateCrypto_prices> {
    return getPrismaFromContext(ctx).crypto_prices.aggregate({
      ...args,
      ...transformInfoIntoPrismaArgs(info),
    });
  }
}
