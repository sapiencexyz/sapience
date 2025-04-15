import { Field, ObjectType, ID, Directive } from 'type-graphql';
import { MarketGroupType } from './MarketGroupType';
import { ResourcePriceType } from './ResourcePriceType';
import { CategoryType } from './CategoryType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class ResourceType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => CategoryType, { nullable: true })
  category: CategoryType | null;

  @Field(() => [MarketGroupType])
  marketGroups: MarketGroupType[];

  @Field(() => [ResourcePriceType])
  @Directive('@cacheControl(maxAge: 60)')
  resourcePrices: ResourcePriceType[];
}
