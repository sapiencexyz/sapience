import { Field, ObjectType, ID, Int } from 'type-graphql';
import { EpochType } from './EpochType';

@ObjectType()
export class IndexPriceType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  value: string;

  @Field(() => EpochType, { nullable: true })
  epoch: EpochType | null;
}
