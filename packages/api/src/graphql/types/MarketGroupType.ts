import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { MarketType } from './MarketType';
import { ResourceType } from './ResourceType';
import { CategoryType } from './CategoryType';
import { MarketParamsType } from './MarketParamsType';

@Directive('@cacheControl(maxAge: 300)')
@ObjectType()
export class MarketGroupType {
  @Field(() => ID)
  id: number;

  @Field(() => String, { nullable: true })
  address: string | null;

  @Field(() => String, { nullable: true })
  vaultAddress: string;

  @Field(() => Int)
  chainId: number;

  @Field(() => Boolean)
  isYin: boolean;

  @Field(() => Boolean)
  isCumulative: boolean;

  @Field(() => [MarketType])
  markets: MarketType[];

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
  collateralSymbol: string | null;

  @Field(() => Int, { nullable: true })
  collateralDecimals: number | null;

  @Field(() => String, { nullable: true })
  minTradeSize: string | null;

  @Field(() => String, { nullable: true })
  factoryAddress: string | null;

  @Field(() => String, { nullable: true })
  initializationNonce: string | null;

  @Field(() => MarketParamsType, { nullable: true })
  marketParams: MarketParamsType | null;

  @Field(() => String, { nullable: true })
  question: string | null;

  @Field(() => String, { nullable: true })
  claimStatement: string | null;

  @Field(() => String, { nullable: true })
  baseTokenName: string | null;

  @Field(() => String, { nullable: true })
  quoteTokenName: string | null;
}
