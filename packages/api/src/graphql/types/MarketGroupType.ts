import { Field, ObjectType, ID, Int, Directive } from 'type-graphql';
import { MarketType } from './MarketType';
import { ResourceType } from './ResourceType';
import { CategoryType } from './CategoryType';

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

  @Field(() => Int, { nullable: true })
  marketParamsFeerate: number | null;

  @Field(() => String, { nullable: true })
  marketParamsAssertionliveness: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondcurrency: string | null;

  @Field(() => String, { nullable: true })
  marketParamsBondamount: string | null;

  @Field(() => String, { nullable: true })
  marketParamsClaimstatement: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswappositionmanager: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapswaprouter: string | null;

  @Field(() => String, { nullable: true })
  marketParamsUniswapquoter: string | null;

  @Field(() => String, { nullable: true })
  marketParamsOptimisticoraclev3: string | null;

  @Field(() => String, { nullable: true })
  question: string | null;

  @Field(() => String, { nullable: true })
  baseTokenName: string | null;

  @Field(() => String, { nullable: true })
  quoteTokenName: string | null;
}
