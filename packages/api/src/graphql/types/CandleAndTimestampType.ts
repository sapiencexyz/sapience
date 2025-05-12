import { Field, ObjectType, Int, Directive } from 'type-graphql';
import { CandleType } from './CandleType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class CandleAndTimestampType {
  @Field(() => Int)
  lastUpdateTimestamp: number;

  @Field(() => [CandleType])
  data: CandleType[];
}
