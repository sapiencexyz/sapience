import { Field, ObjectType, Int, Directive } from 'type-graphql';

@ObjectType()
export class CollateralPnlType {
  //////////////////////////////
  // Collateral Identification
  //////////////////////////////
  @Field(() => String)
  collateralAsset: string;

  @Field(() => String)
  collateralSymbol: string;

  @Field(() => String)
  collateralDecimals: string;

  @Field(() => String)
  collateralUnifiedPrice: string; // USD/collateral unit

  //////////////////////////////
  // PnL Data
  //////////////////////////////
  @Field(() => String)
  totalDeposits: string; // in collateral units

  @Field(() => String)
  totalWithdrawals: string; // in collateral units

  @Field(() => String)
  openPositionsPnL: string; // in collateral units

  @Field(() => [Int])
  positions: number[]; // do we need the market ids too?

  @Field(() => Int)
  positionCount: number;
}

@Directive('@cacheControl(maxAge: 30)')
@ObjectType()
export class GlobalPnLType {
  @Field(() => String)
  owner: string;

  @Field(() => String)
  totalUnifiedPnL: string; // in USD

  @Field(() => [CollateralPnlType])
  collateralPnls: CollateralPnlType[];
}
