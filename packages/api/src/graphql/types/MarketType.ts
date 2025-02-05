import { Field, ObjectType, ID, Int } from 'type-graphql';
import { EpochType } from './EpochType';
import { ResourceType } from './ResourceType';

@ObjectType()
export class MarketType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  address: string;

  @Field(() => Int)
  chainId: number;

  @Field(() => Boolean)
  public: boolean;

  @Field(() => [EpochType])
  epochs: EpochType[];

  @Field(() => ResourceType, { nullable: true })
  resource: ResourceType | null;

  @Field(() => Int, { nullable: true })
  deployTimestamp: number | null;

  @Field(() => Int, { nullable: true })
  deployTxnBlockNumber: number | null;

  @Field(() => String, { nullable: true })
  owner: string | null;

  @Field(() => String, { nullable: true })
  collateralAsset: string | null;
} 