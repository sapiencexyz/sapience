import { Field, ObjectType, Int, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 300)')
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
