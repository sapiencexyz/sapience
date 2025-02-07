import { Field, ObjectType, Int } from 'type-graphql';

@ObjectType()
export class CandleType {
  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  open: string;

  @Field(() => String)
  high: string;

  @Field(() => String)
  low: string;

  @Field(() => String)
  close: string;
}
