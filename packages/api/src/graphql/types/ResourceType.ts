import { Field, ObjectType, ID, Directive } from 'type-graphql';
import { MarketType } from './MarketType';
import { ResourcePriceType } from './ResourcePriceType';

@Directive("@cacheControl(maxAge: 300)")
@ObjectType()
export class ResourceType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => [MarketType])
  markets: MarketType[];

  @Field(() => [ResourcePriceType])
  @Directive("@cacheControl(maxAge: 60)")
  resourcePrices: ResourcePriceType[];
}
