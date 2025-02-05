import { Field, ObjectType, ID, Int } from 'type-graphql';
import { ResourceType } from './ResourceType';

@ObjectType()
export class ResourcePriceType {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  timestamp: number;

  @Field(() => String)
  value: string;

  @Field(() => ResourceType, { nullable: true })
  resource: ResourceType | null;

  @Field(() => Int)
  blockNumber: number;
} 