import { Field, ObjectType, ID } from 'type-graphql';
import { MarketType } from './MarketType';
import { ResourcePriceType } from './ResourcePriceType';

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
  resourcePrices: ResourcePriceType[];
} 