import { Field, ObjectType, ID, Directive } from 'type-graphql';
import { MarketGroupType } from './MarketGroupType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class CategoryType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => [MarketGroupType])
  marketGroups: MarketGroupType[];
}
