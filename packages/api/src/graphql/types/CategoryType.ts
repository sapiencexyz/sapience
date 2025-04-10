import { Field, ObjectType, ID, Directive } from 'type-graphql';
import { MarketType } from './MarketType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class CategoryType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  slug: string;

  @Field(() => [MarketType])
  markets: MarketType[];
}
