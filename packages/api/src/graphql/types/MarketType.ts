import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { EpochType } from './EpochType';
import { ResourceType } from './ResourceType';
import { CategoryType } from './CategoryType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class MarketType {
  @Field(() => ID)
  id: number;

  @Field(() => String)
  address: string;

  @Field(() => String, { nullable: true })
  vaultAddress: string;

  @Field(() => Int)
  chainId: number;

  @Field(() => Boolean)
  isYin: boolean;

  @Field(() => Boolean)
  isCumulative: boolean;

  @Field(() => [EpochType])
  epochs: EpochType[];

  @Field(() => ResourceType, { nullable: true })
  resource: ResourceType | null;

  @Field(() => CategoryType, { nullable: true })
  category: CategoryType | null;

  @Field(() => Int, { nullable: true })
  deployTimestamp: number | null;

  @Field(() => Int, { nullable: true })
  deployTxnBlockNumber: number | null;

  @Field(() => String, { nullable: true })
  owner: string | null;

  @Field(() => String, { nullable: true })
  collateralAsset: string | null;

  @Field(() => String, { nullable: true })
  question: string | null;

  @Field(() => String, { nullable: true })
  claimStatement: string | null;
}
