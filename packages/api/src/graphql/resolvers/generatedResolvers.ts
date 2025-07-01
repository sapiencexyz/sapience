
import {

  FindManyMarketResolver,
  FindFirstMarketResolver,
  FindUniqueMarketResolver,
  FindFirstMarketOrThrowResolver,
  FindUniqueMarketOrThrowResolver,
  AggregateMarketResolver,
  GroupByMarketResolver,
  
  FindManyMarket_groupResolver,
  FindFirstMarket_groupResolver,
  FindUniqueMarket_groupResolver,
  FindFirstMarket_groupOrThrowResolver,
  FindUniqueMarket_groupOrThrowResolver,
  AggregateMarket_groupResolver,
  GroupByMarket_groupResolver,
  
  FindManyResourceResolver,
  FindFirstResourceResolver,
  FindUniqueResourceResolver,
  FindFirstResourceOrThrowResolver,
  FindUniqueResourceOrThrowResolver,
  AggregateResourceResolver,
  GroupByResourceResolver,
  
  FindManyCategoryResolver,
  FindFirstCategoryResolver,
  FindUniqueCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindUniqueCategoryOrThrowResolver,
  AggregateCategoryResolver,
  GroupByCategoryResolver,
  

  FindManyPositionResolver,
  FindFirstPositionResolver,
  FindUniquePositionResolver,
  FindFirstPositionOrThrowResolver,
  FindUniquePositionOrThrowResolver,
  AggregatePositionResolver,
  GroupByPositionResolver,
  
  FindManyTransactionResolver,
  FindFirstTransactionResolver,
  FindUniqueTransactionResolver,
  FindFirstTransactionOrThrowResolver,
  FindUniqueTransactionOrThrowResolver,
  AggregateTransactionResolver,
  GroupByTransactionResolver,
  
  FindManyEventResolver,
  FindFirstEventResolver,
  FindUniqueEventResolver,
  FindFirstEventOrThrowResolver,
  FindUniqueEventOrThrowResolver,
  AggregateEventResolver,
  GroupByEventResolver,
  
  FindManyResource_priceResolver,
  FindFirstResource_priceResolver,
  FindUniqueResource_priceResolver,
  FindFirstResource_priceOrThrowResolver,
  FindUniqueResource_priceOrThrowResolver,
  AggregateResource_priceResolver,
  GroupByResource_priceResolver,
  
  FindManyCrypto_pricesResolver,
  FindFirstCrypto_pricesResolver,
  FindUniqueCrypto_pricesResolver,
  AggregateCrypto_pricesResolver,
  
  FindManyRender_jobResolver,
  FindFirstRender_jobResolver,
  FindUniqueRender_jobResolver,
  AggregateRender_jobResolver,
  
  FindManyCache_candleResolver,
  FindFirstCache_candleResolver,
  FindUniqueCache_candleResolver,
  AggregateCache_candleResolver,
} from '@generated/type-graphql';

export const CORE_FIND_RESOLVERS = [

  FindManyMarketResolver,
  FindFirstMarketResolver,
  FindUniqueMarketResolver,
  FindFirstMarketOrThrowResolver,
  FindUniqueMarketOrThrowResolver,
  
  FindManyMarket_groupResolver,
  FindFirstMarket_groupResolver,
  FindUniqueMarket_groupResolver,
  FindFirstMarket_groupOrThrowResolver,
  FindUniqueMarket_groupOrThrowResolver,
  
  FindManyResourceResolver,
  FindFirstResourceResolver,
  FindUniqueResourceResolver,
  FindFirstResourceOrThrowResolver,
  FindUniqueResourceOrThrowResolver,
  
  FindManyCategoryResolver,
  FindFirstCategoryResolver,
  FindUniqueCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindUniqueCategoryOrThrowResolver,
  
  FindManyPositionResolver,
  FindFirstPositionResolver,
  FindUniquePositionResolver,
  FindFirstPositionOrThrowResolver,
  FindUniquePositionOrThrowResolver,
  
  FindManyTransactionResolver,
  FindFirstTransactionResolver,
  FindUniqueTransactionResolver,
  FindFirstTransactionOrThrowResolver,
  FindUniqueTransactionOrThrowResolver,
  
  FindManyEventResolver,
  FindFirstEventResolver,
  FindUniqueEventResolver,
  FindFirstEventOrThrowResolver,
  FindUniqueEventOrThrowResolver,
  
  FindManyResource_priceResolver,
  FindFirstResource_priceResolver,
  FindUniqueResource_priceResolver,
  FindFirstResource_priceOrThrowResolver,
  FindUniqueResource_priceOrThrowResolver,
];


export const AGGREGATION_RESOLVERS = [
  AggregateMarketResolver,
  AggregateMarket_groupResolver,
  AggregateResourceResolver,
  AggregateCategoryResolver,
  AggregatePositionResolver,
  AggregateTransactionResolver,
  AggregateEventResolver,
  AggregateResource_priceResolver,
  AggregateCrypto_pricesResolver,
  AggregateRender_jobResolver,
  AggregateCache_candleResolver,
];


export const GROUPING_RESOLVERS = [
  GroupByMarketResolver,
  GroupByMarket_groupResolver,
  GroupByResourceResolver,
  GroupByCategoryResolver,
  GroupByPositionResolver,
  GroupByTransactionResolver,
  GroupByEventResolver,
  GroupByResource_priceResolver,
];


export const UTILITY_RESOLVERS = [
  FindManyCrypto_pricesResolver,
  FindFirstCrypto_pricesResolver,
  FindUniqueCrypto_pricesResolver,
  
  FindManyRender_jobResolver,
  FindFirstRender_jobResolver,
  FindUniqueRender_jobResolver,
  
  FindManyCache_candleResolver,
  FindFirstCache_candleResolver,
  FindUniqueCache_candleResolver,
];

export const ALL_GENERATED_RESOLVERS = [
  ...CORE_FIND_RESOLVERS,
  ...AGGREGATION_RESOLVERS,
  ...GROUPING_RESOLVERS,
  ...UTILITY_RESOLVERS,
]; 