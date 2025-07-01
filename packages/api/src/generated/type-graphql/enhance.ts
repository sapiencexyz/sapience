import { ClassType } from "type-graphql";
import * as tslib from "tslib";
import * as crudResolvers from "./resolvers/crud/resolvers-crud.index";
import * as argsTypes from "./resolvers/crud/args.index";
import * as actionResolvers from "./resolvers/crud/resolvers-actions.index";
import * as relationResolvers from "./resolvers/relations/resolvers.index";
import * as models from "./models";
import * as outputTypes from "./resolvers/outputs";
import * as inputTypes from "./resolvers/inputs";

export type MethodDecoratorOverrideFn = (decorators: MethodDecorator[]) => MethodDecorator[];

const crudResolversMap = {
  Cache_candle: crudResolvers.Cache_candleCrudResolver,
  Cache_param: crudResolvers.Cache_paramCrudResolver,
  Category: crudResolvers.CategoryCrudResolver,
  Collateral_transfer: crudResolvers.Collateral_transferCrudResolver,
  Crypto_prices: crudResolvers.Crypto_pricesCrudResolver,
  Event: crudResolvers.EventCrudResolver,
  Market: crudResolvers.MarketCrudResolver,
  Market_group: crudResolvers.Market_groupCrudResolver,
  Market_price: crudResolvers.Market_priceCrudResolver,
  Migrations: crudResolvers.MigrationsCrudResolver,
  Position: crudResolvers.PositionCrudResolver,
  Render_job: crudResolvers.Render_jobCrudResolver,
  Resource: crudResolvers.ResourceCrudResolver,
  Resource_price: crudResolvers.Resource_priceCrudResolver,
  Transaction: crudResolvers.TransactionCrudResolver
};
const actionResolversMap = {
  Cache_candle: {
    aggregateCache_candle: actionResolvers.AggregateCache_candleResolver,
    createManyCache_candle: actionResolvers.CreateManyCache_candleResolver,
    createManyAndReturnCache_candle: actionResolvers.CreateManyAndReturnCache_candleResolver,
    createOneCache_candle: actionResolvers.CreateOneCache_candleResolver,
    deleteManyCache_candle: actionResolvers.DeleteManyCache_candleResolver,
    deleteOneCache_candle: actionResolvers.DeleteOneCache_candleResolver,
    findFirstCache_candle: actionResolvers.FindFirstCache_candleResolver,
    findFirstCache_candleOrThrow: actionResolvers.FindFirstCache_candleOrThrowResolver,
    cache_candles: actionResolvers.FindManyCache_candleResolver,
    cache_candle: actionResolvers.FindUniqueCache_candleResolver,
    getCache_candle: actionResolvers.FindUniqueCache_candleOrThrowResolver,
    groupByCache_candle: actionResolvers.GroupByCache_candleResolver,
    updateManyCache_candle: actionResolvers.UpdateManyCache_candleResolver,
    updateOneCache_candle: actionResolvers.UpdateOneCache_candleResolver,
    upsertOneCache_candle: actionResolvers.UpsertOneCache_candleResolver
  },
  Cache_param: {
    aggregateCache_param: actionResolvers.AggregateCache_paramResolver,
    createManyCache_param: actionResolvers.CreateManyCache_paramResolver,
    createManyAndReturnCache_param: actionResolvers.CreateManyAndReturnCache_paramResolver,
    createOneCache_param: actionResolvers.CreateOneCache_paramResolver,
    deleteManyCache_param: actionResolvers.DeleteManyCache_paramResolver,
    deleteOneCache_param: actionResolvers.DeleteOneCache_paramResolver,
    findFirstCache_param: actionResolvers.FindFirstCache_paramResolver,
    findFirstCache_paramOrThrow: actionResolvers.FindFirstCache_paramOrThrowResolver,
    cache_params: actionResolvers.FindManyCache_paramResolver,
    cache_param: actionResolvers.FindUniqueCache_paramResolver,
    getCache_param: actionResolvers.FindUniqueCache_paramOrThrowResolver,
    groupByCache_param: actionResolvers.GroupByCache_paramResolver,
    updateManyCache_param: actionResolvers.UpdateManyCache_paramResolver,
    updateOneCache_param: actionResolvers.UpdateOneCache_paramResolver,
    upsertOneCache_param: actionResolvers.UpsertOneCache_paramResolver
  },
  Category: {
    aggregateCategory: actionResolvers.AggregateCategoryResolver,
    createManyCategory: actionResolvers.CreateManyCategoryResolver,
    createManyAndReturnCategory: actionResolvers.CreateManyAndReturnCategoryResolver,
    createOneCategory: actionResolvers.CreateOneCategoryResolver,
    deleteManyCategory: actionResolvers.DeleteManyCategoryResolver,
    deleteOneCategory: actionResolvers.DeleteOneCategoryResolver,
    findFirstCategory: actionResolvers.FindFirstCategoryResolver,
    findFirstCategoryOrThrow: actionResolvers.FindFirstCategoryOrThrowResolver,
    categories: actionResolvers.FindManyCategoryResolver,
    category: actionResolvers.FindUniqueCategoryResolver,
    getCategory: actionResolvers.FindUniqueCategoryOrThrowResolver,
    groupByCategory: actionResolvers.GroupByCategoryResolver,
    updateManyCategory: actionResolvers.UpdateManyCategoryResolver,
    updateOneCategory: actionResolvers.UpdateOneCategoryResolver,
    upsertOneCategory: actionResolvers.UpsertOneCategoryResolver
  },
  Collateral_transfer: {
    aggregateCollateral_transfer: actionResolvers.AggregateCollateral_transferResolver,
    createManyCollateral_transfer: actionResolvers.CreateManyCollateral_transferResolver,
    createManyAndReturnCollateral_transfer: actionResolvers.CreateManyAndReturnCollateral_transferResolver,
    createOneCollateral_transfer: actionResolvers.CreateOneCollateral_transferResolver,
    deleteManyCollateral_transfer: actionResolvers.DeleteManyCollateral_transferResolver,
    deleteOneCollateral_transfer: actionResolvers.DeleteOneCollateral_transferResolver,
    findFirstCollateral_transfer: actionResolvers.FindFirstCollateral_transferResolver,
    findFirstCollateral_transferOrThrow: actionResolvers.FindFirstCollateral_transferOrThrowResolver,
    collateral_transfers: actionResolvers.FindManyCollateral_transferResolver,
    collateral_transfer: actionResolvers.FindUniqueCollateral_transferResolver,
    getCollateral_transfer: actionResolvers.FindUniqueCollateral_transferOrThrowResolver,
    groupByCollateral_transfer: actionResolvers.GroupByCollateral_transferResolver,
    updateManyCollateral_transfer: actionResolvers.UpdateManyCollateral_transferResolver,
    updateOneCollateral_transfer: actionResolvers.UpdateOneCollateral_transferResolver,
    upsertOneCollateral_transfer: actionResolvers.UpsertOneCollateral_transferResolver
  },
  Crypto_prices: {
    aggregateCrypto_prices: actionResolvers.AggregateCrypto_pricesResolver,
    createManyCrypto_prices: actionResolvers.CreateManyCrypto_pricesResolver,
    createManyAndReturnCrypto_prices: actionResolvers.CreateManyAndReturnCrypto_pricesResolver,
    createOneCrypto_prices: actionResolvers.CreateOneCrypto_pricesResolver,
    deleteManyCrypto_prices: actionResolvers.DeleteManyCrypto_pricesResolver,
    deleteOneCrypto_prices: actionResolvers.DeleteOneCrypto_pricesResolver,
    findFirstCrypto_prices: actionResolvers.FindFirstCrypto_pricesResolver,
    findFirstCrypto_pricesOrThrow: actionResolvers.FindFirstCrypto_pricesOrThrowResolver,
    findManyCrypto_prices: actionResolvers.FindManyCrypto_pricesResolver,
    findUniqueCrypto_prices: actionResolvers.FindUniqueCrypto_pricesResolver,
    findUniqueCrypto_pricesOrThrow: actionResolvers.FindUniqueCrypto_pricesOrThrowResolver,
    groupByCrypto_prices: actionResolvers.GroupByCrypto_pricesResolver,
    updateManyCrypto_prices: actionResolvers.UpdateManyCrypto_pricesResolver,
    updateOneCrypto_prices: actionResolvers.UpdateOneCrypto_pricesResolver,
    upsertOneCrypto_prices: actionResolvers.UpsertOneCrypto_pricesResolver
  },
  Event: {
    aggregateEvent: actionResolvers.AggregateEventResolver,
    createManyEvent: actionResolvers.CreateManyEventResolver,
    createManyAndReturnEvent: actionResolvers.CreateManyAndReturnEventResolver,
    createOneEvent: actionResolvers.CreateOneEventResolver,
    deleteManyEvent: actionResolvers.DeleteManyEventResolver,
    deleteOneEvent: actionResolvers.DeleteOneEventResolver,
    findFirstEvent: actionResolvers.FindFirstEventResolver,
    findFirstEventOrThrow: actionResolvers.FindFirstEventOrThrowResolver,
    events: actionResolvers.FindManyEventResolver,
    event: actionResolvers.FindUniqueEventResolver,
    getEvent: actionResolvers.FindUniqueEventOrThrowResolver,
    groupByEvent: actionResolvers.GroupByEventResolver,
    updateManyEvent: actionResolvers.UpdateManyEventResolver,
    updateOneEvent: actionResolvers.UpdateOneEventResolver,
    upsertOneEvent: actionResolvers.UpsertOneEventResolver
  },
  Market: {
    aggregateMarket: actionResolvers.AggregateMarketResolver,
    createManyMarket: actionResolvers.CreateManyMarketResolver,
    createManyAndReturnMarket: actionResolvers.CreateManyAndReturnMarketResolver,
    createOneMarket: actionResolvers.CreateOneMarketResolver,
    deleteManyMarket: actionResolvers.DeleteManyMarketResolver,
    deleteOneMarket: actionResolvers.DeleteOneMarketResolver,
    findFirstMarket: actionResolvers.FindFirstMarketResolver,
    findFirstMarketOrThrow: actionResolvers.FindFirstMarketOrThrowResolver,
    markets: actionResolvers.FindManyMarketResolver,
    market: actionResolvers.FindUniqueMarketResolver,
    getMarket: actionResolvers.FindUniqueMarketOrThrowResolver,
    groupByMarket: actionResolvers.GroupByMarketResolver,
    updateManyMarket: actionResolvers.UpdateManyMarketResolver,
    updateOneMarket: actionResolvers.UpdateOneMarketResolver,
    upsertOneMarket: actionResolvers.UpsertOneMarketResolver
  },
  Market_group: {
    aggregateMarket_group: actionResolvers.AggregateMarket_groupResolver,
    createManyMarket_group: actionResolvers.CreateManyMarket_groupResolver,
    createManyAndReturnMarket_group: actionResolvers.CreateManyAndReturnMarket_groupResolver,
    createOneMarket_group: actionResolvers.CreateOneMarket_groupResolver,
    deleteManyMarket_group: actionResolvers.DeleteManyMarket_groupResolver,
    deleteOneMarket_group: actionResolvers.DeleteOneMarket_groupResolver,
    findFirstMarket_group: actionResolvers.FindFirstMarket_groupResolver,
    findFirstMarket_groupOrThrow: actionResolvers.FindFirstMarket_groupOrThrowResolver,
    market_groups: actionResolvers.FindManyMarket_groupResolver,
    market_group: actionResolvers.FindUniqueMarket_groupResolver,
    getMarket_group: actionResolvers.FindUniqueMarket_groupOrThrowResolver,
    groupByMarket_group: actionResolvers.GroupByMarket_groupResolver,
    updateManyMarket_group: actionResolvers.UpdateManyMarket_groupResolver,
    updateOneMarket_group: actionResolvers.UpdateOneMarket_groupResolver,
    upsertOneMarket_group: actionResolvers.UpsertOneMarket_groupResolver
  },
  Market_price: {
    aggregateMarket_price: actionResolvers.AggregateMarket_priceResolver,
    createManyMarket_price: actionResolvers.CreateManyMarket_priceResolver,
    createManyAndReturnMarket_price: actionResolvers.CreateManyAndReturnMarket_priceResolver,
    createOneMarket_price: actionResolvers.CreateOneMarket_priceResolver,
    deleteManyMarket_price: actionResolvers.DeleteManyMarket_priceResolver,
    deleteOneMarket_price: actionResolvers.DeleteOneMarket_priceResolver,
    findFirstMarket_price: actionResolvers.FindFirstMarket_priceResolver,
    findFirstMarket_priceOrThrow: actionResolvers.FindFirstMarket_priceOrThrowResolver,
    market_prices: actionResolvers.FindManyMarket_priceResolver,
    market_price: actionResolvers.FindUniqueMarket_priceResolver,
    getMarket_price: actionResolvers.FindUniqueMarket_priceOrThrowResolver,
    groupByMarket_price: actionResolvers.GroupByMarket_priceResolver,
    updateManyMarket_price: actionResolvers.UpdateManyMarket_priceResolver,
    updateOneMarket_price: actionResolvers.UpdateOneMarket_priceResolver,
    upsertOneMarket_price: actionResolvers.UpsertOneMarket_priceResolver
  },
  Migrations: {
    aggregateMigrations: actionResolvers.AggregateMigrationsResolver,
    createManyMigrations: actionResolvers.CreateManyMigrationsResolver,
    createManyAndReturnMigrations: actionResolvers.CreateManyAndReturnMigrationsResolver,
    createOneMigrations: actionResolvers.CreateOneMigrationsResolver,
    deleteManyMigrations: actionResolvers.DeleteManyMigrationsResolver,
    deleteOneMigrations: actionResolvers.DeleteOneMigrationsResolver,
    findFirstMigrations: actionResolvers.FindFirstMigrationsResolver,
    findFirstMigrationsOrThrow: actionResolvers.FindFirstMigrationsOrThrowResolver,
    findManyMigrations: actionResolvers.FindManyMigrationsResolver,
    findUniqueMigrations: actionResolvers.FindUniqueMigrationsResolver,
    findUniqueMigrationsOrThrow: actionResolvers.FindUniqueMigrationsOrThrowResolver,
    groupByMigrations: actionResolvers.GroupByMigrationsResolver,
    updateManyMigrations: actionResolvers.UpdateManyMigrationsResolver,
    updateOneMigrations: actionResolvers.UpdateOneMigrationsResolver,
    upsertOneMigrations: actionResolvers.UpsertOneMigrationsResolver
  },
  Position: {
    aggregatePosition: actionResolvers.AggregatePositionResolver,
    createManyPosition: actionResolvers.CreateManyPositionResolver,
    createManyAndReturnPosition: actionResolvers.CreateManyAndReturnPositionResolver,
    createOnePosition: actionResolvers.CreateOnePositionResolver,
    deleteManyPosition: actionResolvers.DeleteManyPositionResolver,
    deleteOnePosition: actionResolvers.DeleteOnePositionResolver,
    findFirstPosition: actionResolvers.FindFirstPositionResolver,
    findFirstPositionOrThrow: actionResolvers.FindFirstPositionOrThrowResolver,
    positions: actionResolvers.FindManyPositionResolver,
    position: actionResolvers.FindUniquePositionResolver,
    getPosition: actionResolvers.FindUniquePositionOrThrowResolver,
    groupByPosition: actionResolvers.GroupByPositionResolver,
    updateManyPosition: actionResolvers.UpdateManyPositionResolver,
    updateOnePosition: actionResolvers.UpdateOnePositionResolver,
    upsertOnePosition: actionResolvers.UpsertOnePositionResolver
  },
  Render_job: {
    aggregateRender_job: actionResolvers.AggregateRender_jobResolver,
    createManyRender_job: actionResolvers.CreateManyRender_jobResolver,
    createManyAndReturnRender_job: actionResolvers.CreateManyAndReturnRender_jobResolver,
    createOneRender_job: actionResolvers.CreateOneRender_jobResolver,
    deleteManyRender_job: actionResolvers.DeleteManyRender_jobResolver,
    deleteOneRender_job: actionResolvers.DeleteOneRender_jobResolver,
    findFirstRender_job: actionResolvers.FindFirstRender_jobResolver,
    findFirstRender_jobOrThrow: actionResolvers.FindFirstRender_jobOrThrowResolver,
    render_jobs: actionResolvers.FindManyRender_jobResolver,
    render_job: actionResolvers.FindUniqueRender_jobResolver,
    getRender_job: actionResolvers.FindUniqueRender_jobOrThrowResolver,
    groupByRender_job: actionResolvers.GroupByRender_jobResolver,
    updateManyRender_job: actionResolvers.UpdateManyRender_jobResolver,
    updateOneRender_job: actionResolvers.UpdateOneRender_jobResolver,
    upsertOneRender_job: actionResolvers.UpsertOneRender_jobResolver
  },
  Resource: {
    aggregateResource: actionResolvers.AggregateResourceResolver,
    createManyResource: actionResolvers.CreateManyResourceResolver,
    createManyAndReturnResource: actionResolvers.CreateManyAndReturnResourceResolver,
    createOneResource: actionResolvers.CreateOneResourceResolver,
    deleteManyResource: actionResolvers.DeleteManyResourceResolver,
    deleteOneResource: actionResolvers.DeleteOneResourceResolver,
    findFirstResource: actionResolvers.FindFirstResourceResolver,
    findFirstResourceOrThrow: actionResolvers.FindFirstResourceOrThrowResolver,
    resources: actionResolvers.FindManyResourceResolver,
    resource: actionResolvers.FindUniqueResourceResolver,
    getResource: actionResolvers.FindUniqueResourceOrThrowResolver,
    groupByResource: actionResolvers.GroupByResourceResolver,
    updateManyResource: actionResolvers.UpdateManyResourceResolver,
    updateOneResource: actionResolvers.UpdateOneResourceResolver,
    upsertOneResource: actionResolvers.UpsertOneResourceResolver
  },
  Resource_price: {
    aggregateResource_price: actionResolvers.AggregateResource_priceResolver,
    createManyResource_price: actionResolvers.CreateManyResource_priceResolver,
    createManyAndReturnResource_price: actionResolvers.CreateManyAndReturnResource_priceResolver,
    createOneResource_price: actionResolvers.CreateOneResource_priceResolver,
    deleteManyResource_price: actionResolvers.DeleteManyResource_priceResolver,
    deleteOneResource_price: actionResolvers.DeleteOneResource_priceResolver,
    findFirstResource_price: actionResolvers.FindFirstResource_priceResolver,
    findFirstResource_priceOrThrow: actionResolvers.FindFirstResource_priceOrThrowResolver,
    resource_prices: actionResolvers.FindManyResource_priceResolver,
    resource_price: actionResolvers.FindUniqueResource_priceResolver,
    getResource_price: actionResolvers.FindUniqueResource_priceOrThrowResolver,
    groupByResource_price: actionResolvers.GroupByResource_priceResolver,
    updateManyResource_price: actionResolvers.UpdateManyResource_priceResolver,
    updateOneResource_price: actionResolvers.UpdateOneResource_priceResolver,
    upsertOneResource_price: actionResolvers.UpsertOneResource_priceResolver
  },
  Transaction: {
    aggregateTransaction: actionResolvers.AggregateTransactionResolver,
    createManyTransaction: actionResolvers.CreateManyTransactionResolver,
    createManyAndReturnTransaction: actionResolvers.CreateManyAndReturnTransactionResolver,
    createOneTransaction: actionResolvers.CreateOneTransactionResolver,
    deleteManyTransaction: actionResolvers.DeleteManyTransactionResolver,
    deleteOneTransaction: actionResolvers.DeleteOneTransactionResolver,
    findFirstTransaction: actionResolvers.FindFirstTransactionResolver,
    findFirstTransactionOrThrow: actionResolvers.FindFirstTransactionOrThrowResolver,
    transactions: actionResolvers.FindManyTransactionResolver,
    transaction: actionResolvers.FindUniqueTransactionResolver,
    getTransaction: actionResolvers.FindUniqueTransactionOrThrowResolver,
    groupByTransaction: actionResolvers.GroupByTransactionResolver,
    updateManyTransaction: actionResolvers.UpdateManyTransactionResolver,
    updateOneTransaction: actionResolvers.UpdateOneTransactionResolver,
    upsertOneTransaction: actionResolvers.UpsertOneTransactionResolver
  }
};
const crudResolversInfo = {
  Cache_candle: ["aggregateCache_candle", "createManyCache_candle", "createManyAndReturnCache_candle", "createOneCache_candle", "deleteManyCache_candle", "deleteOneCache_candle", "findFirstCache_candle", "findFirstCache_candleOrThrow", "cache_candles", "cache_candle", "getCache_candle", "groupByCache_candle", "updateManyCache_candle", "updateOneCache_candle", "upsertOneCache_candle"],
  Cache_param: ["aggregateCache_param", "createManyCache_param", "createManyAndReturnCache_param", "createOneCache_param", "deleteManyCache_param", "deleteOneCache_param", "findFirstCache_param", "findFirstCache_paramOrThrow", "cache_params", "cache_param", "getCache_param", "groupByCache_param", "updateManyCache_param", "updateOneCache_param", "upsertOneCache_param"],
  Category: ["aggregateCategory", "createManyCategory", "createManyAndReturnCategory", "createOneCategory", "deleteManyCategory", "deleteOneCategory", "findFirstCategory", "findFirstCategoryOrThrow", "categories", "category", "getCategory", "groupByCategory", "updateManyCategory", "updateOneCategory", "upsertOneCategory"],
  Collateral_transfer: ["aggregateCollateral_transfer", "createManyCollateral_transfer", "createManyAndReturnCollateral_transfer", "createOneCollateral_transfer", "deleteManyCollateral_transfer", "deleteOneCollateral_transfer", "findFirstCollateral_transfer", "findFirstCollateral_transferOrThrow", "collateral_transfers", "collateral_transfer", "getCollateral_transfer", "groupByCollateral_transfer", "updateManyCollateral_transfer", "updateOneCollateral_transfer", "upsertOneCollateral_transfer"],
  Crypto_prices: ["aggregateCrypto_prices", "createManyCrypto_prices", "createManyAndReturnCrypto_prices", "createOneCrypto_prices", "deleteManyCrypto_prices", "deleteOneCrypto_prices", "findFirstCrypto_prices", "findFirstCrypto_pricesOrThrow", "findManyCrypto_prices", "findUniqueCrypto_prices", "findUniqueCrypto_pricesOrThrow", "groupByCrypto_prices", "updateManyCrypto_prices", "updateOneCrypto_prices", "upsertOneCrypto_prices"],
  Event: ["aggregateEvent", "createManyEvent", "createManyAndReturnEvent", "createOneEvent", "deleteManyEvent", "deleteOneEvent", "findFirstEvent", "findFirstEventOrThrow", "events", "event", "getEvent", "groupByEvent", "updateManyEvent", "updateOneEvent", "upsertOneEvent"],
  Market: ["aggregateMarket", "createManyMarket", "createManyAndReturnMarket", "createOneMarket", "deleteManyMarket", "deleteOneMarket", "findFirstMarket", "findFirstMarketOrThrow", "markets", "market", "getMarket", "groupByMarket", "updateManyMarket", "updateOneMarket", "upsertOneMarket"],
  Market_group: ["aggregateMarket_group", "createManyMarket_group", "createManyAndReturnMarket_group", "createOneMarket_group", "deleteManyMarket_group", "deleteOneMarket_group", "findFirstMarket_group", "findFirstMarket_groupOrThrow", "market_groups", "market_group", "getMarket_group", "groupByMarket_group", "updateManyMarket_group", "updateOneMarket_group", "upsertOneMarket_group"],
  Market_price: ["aggregateMarket_price", "createManyMarket_price", "createManyAndReturnMarket_price", "createOneMarket_price", "deleteManyMarket_price", "deleteOneMarket_price", "findFirstMarket_price", "findFirstMarket_priceOrThrow", "market_prices", "market_price", "getMarket_price", "groupByMarket_price", "updateManyMarket_price", "updateOneMarket_price", "upsertOneMarket_price"],
  Migrations: ["aggregateMigrations", "createManyMigrations", "createManyAndReturnMigrations", "createOneMigrations", "deleteManyMigrations", "deleteOneMigrations", "findFirstMigrations", "findFirstMigrationsOrThrow", "findManyMigrations", "findUniqueMigrations", "findUniqueMigrationsOrThrow", "groupByMigrations", "updateManyMigrations", "updateOneMigrations", "upsertOneMigrations"],
  Position: ["aggregatePosition", "createManyPosition", "createManyAndReturnPosition", "createOnePosition", "deleteManyPosition", "deleteOnePosition", "findFirstPosition", "findFirstPositionOrThrow", "positions", "position", "getPosition", "groupByPosition", "updateManyPosition", "updateOnePosition", "upsertOnePosition"],
  Render_job: ["aggregateRender_job", "createManyRender_job", "createManyAndReturnRender_job", "createOneRender_job", "deleteManyRender_job", "deleteOneRender_job", "findFirstRender_job", "findFirstRender_jobOrThrow", "render_jobs", "render_job", "getRender_job", "groupByRender_job", "updateManyRender_job", "updateOneRender_job", "upsertOneRender_job"],
  Resource: ["aggregateResource", "createManyResource", "createManyAndReturnResource", "createOneResource", "deleteManyResource", "deleteOneResource", "findFirstResource", "findFirstResourceOrThrow", "resources", "resource", "getResource", "groupByResource", "updateManyResource", "updateOneResource", "upsertOneResource"],
  Resource_price: ["aggregateResource_price", "createManyResource_price", "createManyAndReturnResource_price", "createOneResource_price", "deleteManyResource_price", "deleteOneResource_price", "findFirstResource_price", "findFirstResource_priceOrThrow", "resource_prices", "resource_price", "getResource_price", "groupByResource_price", "updateManyResource_price", "updateOneResource_price", "upsertOneResource_price"],
  Transaction: ["aggregateTransaction", "createManyTransaction", "createManyAndReturnTransaction", "createOneTransaction", "deleteManyTransaction", "deleteOneTransaction", "findFirstTransaction", "findFirstTransactionOrThrow", "transactions", "transaction", "getTransaction", "groupByTransaction", "updateManyTransaction", "updateOneTransaction", "upsertOneTransaction"]
};
const argsInfo = {
  AggregateCache_candleArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyCache_candleArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnCache_candleArgs: ["data", "skipDuplicates"],
  CreateOneCache_candleArgs: ["data"],
  DeleteManyCache_candleArgs: ["where"],
  DeleteOneCache_candleArgs: ["where"],
  FindFirstCache_candleArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstCache_candleOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyCache_candleArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueCache_candleArgs: ["where"],
  FindUniqueCache_candleOrThrowArgs: ["where"],
  GroupByCache_candleArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyCache_candleArgs: ["data", "where"],
  UpdateOneCache_candleArgs: ["data", "where"],
  UpsertOneCache_candleArgs: ["where", "create", "update"],
  AggregateCache_paramArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyCache_paramArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnCache_paramArgs: ["data", "skipDuplicates"],
  CreateOneCache_paramArgs: ["data"],
  DeleteManyCache_paramArgs: ["where"],
  DeleteOneCache_paramArgs: ["where"],
  FindFirstCache_paramArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstCache_paramOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyCache_paramArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueCache_paramArgs: ["where"],
  FindUniqueCache_paramOrThrowArgs: ["where"],
  GroupByCache_paramArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyCache_paramArgs: ["data", "where"],
  UpdateOneCache_paramArgs: ["data", "where"],
  UpsertOneCache_paramArgs: ["where", "create", "update"],
  AggregateCategoryArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyCategoryArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnCategoryArgs: ["data", "skipDuplicates"],
  CreateOneCategoryArgs: ["data"],
  DeleteManyCategoryArgs: ["where"],
  DeleteOneCategoryArgs: ["where"],
  FindFirstCategoryArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstCategoryOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyCategoryArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueCategoryArgs: ["where"],
  FindUniqueCategoryOrThrowArgs: ["where"],
  GroupByCategoryArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyCategoryArgs: ["data", "where"],
  UpdateOneCategoryArgs: ["data", "where"],
  UpsertOneCategoryArgs: ["where", "create", "update"],
  AggregateCollateral_transferArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyCollateral_transferArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnCollateral_transferArgs: ["data", "skipDuplicates"],
  CreateOneCollateral_transferArgs: ["data"],
  DeleteManyCollateral_transferArgs: ["where"],
  DeleteOneCollateral_transferArgs: ["where"],
  FindFirstCollateral_transferArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstCollateral_transferOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyCollateral_transferArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueCollateral_transferArgs: ["where"],
  FindUniqueCollateral_transferOrThrowArgs: ["where"],
  GroupByCollateral_transferArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyCollateral_transferArgs: ["data", "where"],
  UpdateOneCollateral_transferArgs: ["data", "where"],
  UpsertOneCollateral_transferArgs: ["where", "create", "update"],
  AggregateCrypto_pricesArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyCrypto_pricesArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnCrypto_pricesArgs: ["data", "skipDuplicates"],
  CreateOneCrypto_pricesArgs: ["data"],
  DeleteManyCrypto_pricesArgs: ["where"],
  DeleteOneCrypto_pricesArgs: ["where"],
  FindFirstCrypto_pricesArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstCrypto_pricesOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyCrypto_pricesArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueCrypto_pricesArgs: ["where"],
  FindUniqueCrypto_pricesOrThrowArgs: ["where"],
  GroupByCrypto_pricesArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyCrypto_pricesArgs: ["data", "where"],
  UpdateOneCrypto_pricesArgs: ["data", "where"],
  UpsertOneCrypto_pricesArgs: ["where", "create", "update"],
  AggregateEventArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyEventArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnEventArgs: ["data", "skipDuplicates"],
  CreateOneEventArgs: ["data"],
  DeleteManyEventArgs: ["where"],
  DeleteOneEventArgs: ["where"],
  FindFirstEventArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstEventOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyEventArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueEventArgs: ["where"],
  FindUniqueEventOrThrowArgs: ["where"],
  GroupByEventArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyEventArgs: ["data", "where"],
  UpdateOneEventArgs: ["data", "where"],
  UpsertOneEventArgs: ["where", "create", "update"],
  AggregateMarketArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyMarketArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnMarketArgs: ["data", "skipDuplicates"],
  CreateOneMarketArgs: ["data"],
  DeleteManyMarketArgs: ["where"],
  DeleteOneMarketArgs: ["where"],
  FindFirstMarketArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstMarketOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyMarketArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueMarketArgs: ["where"],
  FindUniqueMarketOrThrowArgs: ["where"],
  GroupByMarketArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyMarketArgs: ["data", "where"],
  UpdateOneMarketArgs: ["data", "where"],
  UpsertOneMarketArgs: ["where", "create", "update"],
  AggregateMarket_groupArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyMarket_groupArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnMarket_groupArgs: ["data", "skipDuplicates"],
  CreateOneMarket_groupArgs: ["data"],
  DeleteManyMarket_groupArgs: ["where"],
  DeleteOneMarket_groupArgs: ["where"],
  FindFirstMarket_groupArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstMarket_groupOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyMarket_groupArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueMarket_groupArgs: ["where"],
  FindUniqueMarket_groupOrThrowArgs: ["where"],
  GroupByMarket_groupArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyMarket_groupArgs: ["data", "where"],
  UpdateOneMarket_groupArgs: ["data", "where"],
  UpsertOneMarket_groupArgs: ["where", "create", "update"],
  AggregateMarket_priceArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyMarket_priceArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnMarket_priceArgs: ["data", "skipDuplicates"],
  CreateOneMarket_priceArgs: ["data"],
  DeleteManyMarket_priceArgs: ["where"],
  DeleteOneMarket_priceArgs: ["where"],
  FindFirstMarket_priceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstMarket_priceOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyMarket_priceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueMarket_priceArgs: ["where"],
  FindUniqueMarket_priceOrThrowArgs: ["where"],
  GroupByMarket_priceArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyMarket_priceArgs: ["data", "where"],
  UpdateOneMarket_priceArgs: ["data", "where"],
  UpsertOneMarket_priceArgs: ["where", "create", "update"],
  AggregateMigrationsArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyMigrationsArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnMigrationsArgs: ["data", "skipDuplicates"],
  CreateOneMigrationsArgs: ["data"],
  DeleteManyMigrationsArgs: ["where"],
  DeleteOneMigrationsArgs: ["where"],
  FindFirstMigrationsArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstMigrationsOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyMigrationsArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueMigrationsArgs: ["where"],
  FindUniqueMigrationsOrThrowArgs: ["where"],
  GroupByMigrationsArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyMigrationsArgs: ["data", "where"],
  UpdateOneMigrationsArgs: ["data", "where"],
  UpsertOneMigrationsArgs: ["where", "create", "update"],
  AggregatePositionArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyPositionArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnPositionArgs: ["data", "skipDuplicates"],
  CreateOnePositionArgs: ["data"],
  DeleteManyPositionArgs: ["where"],
  DeleteOnePositionArgs: ["where"],
  FindFirstPositionArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstPositionOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyPositionArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniquePositionArgs: ["where"],
  FindUniquePositionOrThrowArgs: ["where"],
  GroupByPositionArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyPositionArgs: ["data", "where"],
  UpdateOnePositionArgs: ["data", "where"],
  UpsertOnePositionArgs: ["where", "create", "update"],
  AggregateRender_jobArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyRender_jobArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnRender_jobArgs: ["data", "skipDuplicates"],
  CreateOneRender_jobArgs: ["data"],
  DeleteManyRender_jobArgs: ["where"],
  DeleteOneRender_jobArgs: ["where"],
  FindFirstRender_jobArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstRender_jobOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyRender_jobArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueRender_jobArgs: ["where"],
  FindUniqueRender_jobOrThrowArgs: ["where"],
  GroupByRender_jobArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyRender_jobArgs: ["data", "where"],
  UpdateOneRender_jobArgs: ["data", "where"],
  UpsertOneRender_jobArgs: ["where", "create", "update"],
  AggregateResourceArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyResourceArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnResourceArgs: ["data", "skipDuplicates"],
  CreateOneResourceArgs: ["data"],
  DeleteManyResourceArgs: ["where"],
  DeleteOneResourceArgs: ["where"],
  FindFirstResourceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstResourceOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyResourceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueResourceArgs: ["where"],
  FindUniqueResourceOrThrowArgs: ["where"],
  GroupByResourceArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyResourceArgs: ["data", "where"],
  UpdateOneResourceArgs: ["data", "where"],
  UpsertOneResourceArgs: ["where", "create", "update"],
  AggregateResource_priceArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyResource_priceArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnResource_priceArgs: ["data", "skipDuplicates"],
  CreateOneResource_priceArgs: ["data"],
  DeleteManyResource_priceArgs: ["where"],
  DeleteOneResource_priceArgs: ["where"],
  FindFirstResource_priceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstResource_priceOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyResource_priceArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueResource_priceArgs: ["where"],
  FindUniqueResource_priceOrThrowArgs: ["where"],
  GroupByResource_priceArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyResource_priceArgs: ["data", "where"],
  UpdateOneResource_priceArgs: ["data", "where"],
  UpsertOneResource_priceArgs: ["where", "create", "update"],
  AggregateTransactionArgs: ["where", "orderBy", "cursor", "take", "skip"],
  CreateManyTransactionArgs: ["data", "skipDuplicates"],
  CreateManyAndReturnTransactionArgs: ["data", "skipDuplicates"],
  CreateOneTransactionArgs: ["data"],
  DeleteManyTransactionArgs: ["where"],
  DeleteOneTransactionArgs: ["where"],
  FindFirstTransactionArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindFirstTransactionOrThrowArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindManyTransactionArgs: ["where", "orderBy", "cursor", "take", "skip", "distinct"],
  FindUniqueTransactionArgs: ["where"],
  FindUniqueTransactionOrThrowArgs: ["where"],
  GroupByTransactionArgs: ["where", "orderBy", "by", "having", "take", "skip"],
  UpdateManyTransactionArgs: ["data", "where"],
  UpdateOneTransactionArgs: ["data", "where"],
  UpsertOneTransactionArgs: ["where", "create", "update"]
};

type ResolverModelNames = keyof typeof crudResolversMap;

type ModelResolverActionNames<
  TModel extends ResolverModelNames
> = keyof typeof crudResolversMap[TModel]["prototype"];

export type ResolverActionsConfig<
  TModel extends ResolverModelNames
> = Partial<Record<ModelResolverActionNames<TModel>, MethodDecorator[] | MethodDecoratorOverrideFn>>
  & {
    _all?: MethodDecorator[];
    _query?: MethodDecorator[];
    _mutation?: MethodDecorator[];
  };

export type ResolversEnhanceMap = {
  [TModel in ResolverModelNames]?: ResolverActionsConfig<TModel>;
};

export function applyResolversEnhanceMap(
  resolversEnhanceMap: ResolversEnhanceMap,
) {
  const mutationOperationPrefixes = [
    "createOne", "createMany", "createManyAndReturn", "deleteOne", "updateOne", "deleteMany", "updateMany", "upsertOne"
  ];
  for (const resolversEnhanceMapKey of Object.keys(resolversEnhanceMap)) {
    const modelName = resolversEnhanceMapKey as keyof typeof resolversEnhanceMap;
    const crudTarget = crudResolversMap[modelName].prototype;
    const resolverActionsConfig = resolversEnhanceMap[modelName]!;
    const actionResolversConfig = actionResolversMap[modelName];
    const allActionsDecorators = resolverActionsConfig._all;
    const resolverActionNames = crudResolversInfo[modelName as keyof typeof crudResolversInfo];
    for (const resolverActionName of resolverActionNames) {
      const maybeDecoratorsOrFn = resolverActionsConfig[
        resolverActionName as keyof typeof resolverActionsConfig
      ] as MethodDecorator[] | MethodDecoratorOverrideFn | undefined;
      const isWriteOperation = mutationOperationPrefixes.some(prefix => resolverActionName.startsWith(prefix));
      const operationKindDecorators = isWriteOperation ? resolverActionsConfig._mutation : resolverActionsConfig._query;
      const mainDecorators = [
        ...allActionsDecorators ?? [],
        ...operationKindDecorators ?? [],
      ]
      let decorators: MethodDecorator[];
      if (typeof maybeDecoratorsOrFn === "function") {
        decorators = maybeDecoratorsOrFn(mainDecorators);
      } else {
        decorators = [...mainDecorators, ...maybeDecoratorsOrFn ?? []];
      }
      const actionTarget = (actionResolversConfig[
        resolverActionName as keyof typeof actionResolversConfig
      ] as Function).prototype;
      tslib.__decorate(decorators, crudTarget, resolverActionName, null);
      tslib.__decorate(decorators, actionTarget, resolverActionName, null);
    }
  }
}

type ArgsTypesNames = keyof typeof argsTypes;

type ArgFieldNames<TArgsType extends ArgsTypesNames> = Exclude<
  keyof typeof argsTypes[TArgsType]["prototype"],
  number | symbol
>;

type ArgFieldsConfig<
  TArgsType extends ArgsTypesNames
> = FieldsConfig<ArgFieldNames<TArgsType>>;

export type ArgConfig<TArgsType extends ArgsTypesNames> = {
  class?: ClassDecorator[];
  fields?: ArgFieldsConfig<TArgsType>;
};

export type ArgsTypesEnhanceMap = {
  [TArgsType in ArgsTypesNames]?: ArgConfig<TArgsType>;
};

export function applyArgsTypesEnhanceMap(
  argsTypesEnhanceMap: ArgsTypesEnhanceMap,
) {
  for (const argsTypesEnhanceMapKey of Object.keys(argsTypesEnhanceMap)) {
    const argsTypeName = argsTypesEnhanceMapKey as keyof typeof argsTypesEnhanceMap;
    const typeConfig = argsTypesEnhanceMap[argsTypeName]!;
    const typeClass = argsTypes[argsTypeName];
    const typeTarget = typeClass.prototype;
    applyTypeClassEnhanceConfig(
      typeConfig,
      typeClass,
      typeTarget,
      argsInfo[argsTypeName as keyof typeof argsInfo],
    );
  }
}

const relationResolversMap = {
  Category: relationResolvers.CategoryRelationsResolver,
  Collateral_transfer: relationResolvers.Collateral_transferRelationsResolver,
  Event: relationResolvers.EventRelationsResolver,
  Market: relationResolvers.MarketRelationsResolver,
  Market_group: relationResolvers.Market_groupRelationsResolver,
  Market_price: relationResolvers.Market_priceRelationsResolver,
  Position: relationResolvers.PositionRelationsResolver,
  Resource: relationResolvers.ResourceRelationsResolver,
  Resource_price: relationResolvers.Resource_priceRelationsResolver,
  Transaction: relationResolvers.TransactionRelationsResolver
};
const relationResolversInfo = {
  Category: ["market_group", "resource"],
  Collateral_transfer: ["transaction"],
  Event: ["market_group", "transaction"],
  Market: ["market_group", "position"],
  Market_group: ["event", "market", "resource", "category"],
  Market_price: ["transaction"],
  Position: ["market", "transaction"],
  Resource: ["market_group", "category", "resource_price"],
  Resource_price: ["resource"],
  Transaction: ["collateral_transfer", "market_price", "event", "position"]
};

type RelationResolverModelNames = keyof typeof relationResolversMap;

type RelationResolverActionNames<
  TModel extends RelationResolverModelNames
> = keyof typeof relationResolversMap[TModel]["prototype"];

export type RelationResolverActionsConfig<TModel extends RelationResolverModelNames>
  = Partial<Record<RelationResolverActionNames<TModel>, MethodDecorator[] | MethodDecoratorOverrideFn>>
  & { _all?: MethodDecorator[] };

export type RelationResolversEnhanceMap = {
  [TModel in RelationResolverModelNames]?: RelationResolverActionsConfig<TModel>;
};

export function applyRelationResolversEnhanceMap(
  relationResolversEnhanceMap: RelationResolversEnhanceMap,
) {
  for (const relationResolversEnhanceMapKey of Object.keys(relationResolversEnhanceMap)) {
    const modelName = relationResolversEnhanceMapKey as keyof typeof relationResolversEnhanceMap;
    const relationResolverTarget = relationResolversMap[modelName].prototype;
    const relationResolverActionsConfig = relationResolversEnhanceMap[modelName]!;
    const allActionsDecorators = relationResolverActionsConfig._all ?? [];
    const relationResolverActionNames = relationResolversInfo[modelName as keyof typeof relationResolversInfo];
    for (const relationResolverActionName of relationResolverActionNames) {
      const maybeDecoratorsOrFn = relationResolverActionsConfig[
        relationResolverActionName as keyof typeof relationResolverActionsConfig
      ] as MethodDecorator[] | MethodDecoratorOverrideFn | undefined;
      let decorators: MethodDecorator[];
      if (typeof maybeDecoratorsOrFn === "function") {
        decorators = maybeDecoratorsOrFn(allActionsDecorators);
      } else {
        decorators = [...allActionsDecorators, ...maybeDecoratorsOrFn ?? []];
      }
      tslib.__decorate(decorators, relationResolverTarget, relationResolverActionName, null);
    }
  }
}

type TypeConfig = {
  class?: ClassDecorator[];
  fields?: FieldsConfig;
};

export type PropertyDecoratorOverrideFn = (decorators: PropertyDecorator[]) => PropertyDecorator[];

type FieldsConfig<TTypeKeys extends string = string> = Partial<
  Record<TTypeKeys, PropertyDecorator[] | PropertyDecoratorOverrideFn>
> & { _all?: PropertyDecorator[] };

function applyTypeClassEnhanceConfig<
  TEnhanceConfig extends TypeConfig,
  TType extends object
>(
  enhanceConfig: TEnhanceConfig,
  typeClass: ClassType<TType>,
  typePrototype: TType,
  typeFieldNames: string[]
) {
  if (enhanceConfig.class) {
    tslib.__decorate(enhanceConfig.class, typeClass);
  }
  if (enhanceConfig.fields) {
    const allFieldsDecorators = enhanceConfig.fields._all ?? [];
    for (const typeFieldName of typeFieldNames) {
      const maybeDecoratorsOrFn = enhanceConfig.fields[
        typeFieldName
      ] as PropertyDecorator[] | PropertyDecoratorOverrideFn | undefined;
      let decorators: PropertyDecorator[];
      if (typeof maybeDecoratorsOrFn === "function") {
        decorators = maybeDecoratorsOrFn(allFieldsDecorators);
      } else {
        decorators = [...allFieldsDecorators, ...maybeDecoratorsOrFn ?? []];
      }
      tslib.__decorate(decorators, typePrototype, typeFieldName, void 0);
    }
  }
}

const modelsInfo = {
  Cache_candle: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_param: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Category: ["id", "createdAt", "name", "slug"],
  Collateral_transfer: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Crypto_prices: ["id", "ticker", "price", "timestamp"],
  Event: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId"],
  Market: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  Market_group: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_price: ["id", "createdAt", "timestamp", "value"],
  Migrations: ["id", "timestamp", "name"],
  Position: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  Render_job: ["id", "createdAt", "jobId", "serviceId"],
  Resource: ["id", "createdAt", "name", "slug", "categoryId"],
  Resource_price: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Transaction: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"]
};

type ModelNames = keyof typeof models;

type ModelFieldNames<TModel extends ModelNames> = Exclude<
  keyof typeof models[TModel]["prototype"],
  number | symbol
>;

type ModelFieldsConfig<TModel extends ModelNames> = FieldsConfig<
  ModelFieldNames<TModel>
>;

export type ModelConfig<TModel extends ModelNames> = {
  class?: ClassDecorator[];
  fields?: ModelFieldsConfig<TModel>;
};

export type ModelsEnhanceMap = {
  [TModel in ModelNames]?: ModelConfig<TModel>;
};

export function applyModelsEnhanceMap(modelsEnhanceMap: ModelsEnhanceMap) {
  for (const modelsEnhanceMapKey of Object.keys(modelsEnhanceMap)) {
    const modelName = modelsEnhanceMapKey as keyof typeof modelsEnhanceMap;
    const modelConfig = modelsEnhanceMap[modelName]!;
    const modelClass = models[modelName];
    const modelTarget = modelClass.prototype;
    applyTypeClassEnhanceConfig(
      modelConfig,
      modelClass,
      modelTarget,
      modelsInfo[modelName as keyof typeof modelsInfo],
    );
  }
}

const outputsInfo = {
  AggregateCache_candle: ["_count", "_avg", "_sum", "_min", "_max"],
  Cache_candleGroupBy: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateCache_param: ["_count", "_avg", "_sum", "_min", "_max"],
  Cache_paramGroupBy: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateCategory: ["_count", "_avg", "_sum", "_min", "_max"],
  CategoryGroupBy: ["id", "createdAt", "name", "slug", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateCollateral_transfer: ["_count", "_avg", "_sum", "_min", "_max"],
  Collateral_transferGroupBy: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateCrypto_prices: ["_count", "_avg", "_sum", "_min", "_max"],
  Crypto_pricesGroupBy: ["id", "ticker", "price", "timestamp", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateEvent: ["_count", "_avg", "_sum", "_min", "_max"],
  EventGroupBy: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateMarket: ["_count", "_avg", "_sum", "_min", "_max"],
  MarketGroupBy: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateMarket_group: ["_count", "_avg", "_sum", "_min", "_max"],
  Market_groupGroupBy: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateMarket_price: ["_count", "_avg", "_sum", "_min", "_max"],
  Market_priceGroupBy: ["id", "createdAt", "timestamp", "value", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateMigrations: ["_count", "_avg", "_sum", "_min", "_max"],
  MigrationsGroupBy: ["id", "timestamp", "name", "_count", "_avg", "_sum", "_min", "_max"],
  AggregatePosition: ["_count", "_avg", "_sum", "_min", "_max"],
  PositionGroupBy: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateRender_job: ["_count", "_avg", "_sum", "_min", "_max"],
  Render_jobGroupBy: ["id", "createdAt", "jobId", "serviceId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateResource: ["_count", "_avg", "_sum", "_min", "_max"],
  ResourceGroupBy: ["id", "createdAt", "name", "slug", "categoryId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateResource_price: ["_count", "_avg", "_sum", "_min", "_max"],
  Resource_priceGroupBy: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "_count", "_avg", "_sum", "_min", "_max"],
  AggregateTransaction: ["_count", "_avg", "_sum", "_min", "_max"],
  TransactionGroupBy: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "_count", "_avg", "_sum", "_min", "_max"],
  AffectedRowsOutput: ["count"],
  Cache_candleCountAggregate: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId", "_all"],
  Cache_candleAvgAggregate: ["id", "interval", "trailingAvgTime", "marketIdx", "timestamp", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "chainId", "marketId"],
  Cache_candleSumAggregate: ["id", "interval", "trailingAvgTime", "marketIdx", "timestamp", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "chainId", "marketId"],
  Cache_candleMinAggregate: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleMaxAggregate: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_paramCountAggregate: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString", "_all"],
  Cache_paramAvgAggregate: ["id", "paramValueNumber"],
  Cache_paramSumAggregate: ["id", "paramValueNumber"],
  Cache_paramMinAggregate: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramMaxAggregate: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  CategoryCount: ["market_group", "resource"],
  CategoryCountAggregate: ["id", "createdAt", "name", "slug", "_all"],
  CategoryAvgAggregate: ["id"],
  CategorySumAggregate: ["id"],
  CategoryMinAggregate: ["id", "createdAt", "name", "slug"],
  CategoryMaxAggregate: ["id", "createdAt", "name", "slug"],
  Collateral_transferCountAggregate: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral", "_all"],
  Collateral_transferAvgAggregate: ["id", "timestamp", "collateral"],
  Collateral_transferSumAggregate: ["id", "timestamp", "collateral"],
  Collateral_transferMinAggregate: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferMaxAggregate: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Crypto_pricesCountAggregate: ["id", "ticker", "price", "timestamp", "_all"],
  Crypto_pricesAvgAggregate: ["id", "price"],
  Crypto_pricesSumAggregate: ["id", "price"],
  Crypto_pricesMinAggregate: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesMaxAggregate: ["id", "ticker", "price", "timestamp"],
  EventCountAggregate: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "_all"],
  EventAvgAggregate: ["id", "blockNumber", "timestamp", "logIndex", "marketGroupId"],
  EventSumAggregate: ["id", "blockNumber", "timestamp", "logIndex", "marketGroupId"],
  EventMinAggregate: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "marketGroupId"],
  EventMaxAggregate: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "marketGroupId"],
  MarketCount: ["position"],
  MarketCountAggregate: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "_all"],
  MarketAvgAggregate: ["id", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount"],
  MarketSumAggregate: ["id", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount"],
  MarketMinAggregate: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  MarketMaxAggregate: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  Market_groupCount: ["event", "market"],
  Market_groupCountAggregate: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "_all"],
  Market_groupAvgAggregate: ["id", "chainId", "deployTimestamp", "deployTxnBlockNumber", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount", "categoryId", "collateralDecimals", "minTradeSize"],
  Market_groupSumAggregate: ["id", "chainId", "deployTimestamp", "deployTxnBlockNumber", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount", "categoryId", "collateralDecimals", "minTradeSize"],
  Market_groupMinAggregate: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_groupMaxAggregate: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_priceCountAggregate: ["id", "createdAt", "timestamp", "value", "_all"],
  Market_priceAvgAggregate: ["id", "timestamp", "value"],
  Market_priceSumAggregate: ["id", "timestamp", "value"],
  Market_priceMinAggregate: ["id", "createdAt", "timestamp", "value"],
  Market_priceMaxAggregate: ["id", "createdAt", "timestamp", "value"],
  MigrationsCountAggregate: ["id", "timestamp", "name", "_all"],
  MigrationsAvgAggregate: ["id", "timestamp"],
  MigrationsSumAggregate: ["id", "timestamp"],
  MigrationsMinAggregate: ["id", "timestamp", "name"],
  MigrationsMaxAggregate: ["id", "timestamp", "name"],
  PositionCount: ["transaction"],
  PositionCountAggregate: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "_all"],
  PositionAvgAggregate: ["id", "positionId", "highPriceTick", "lowPriceTick", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionSumAggregate: ["id", "positionId", "highPriceTick", "lowPriceTick", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionMinAggregate: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionMaxAggregate: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  Render_jobCountAggregate: ["id", "createdAt", "jobId", "serviceId", "_all"],
  Render_jobAvgAggregate: ["id"],
  Render_jobSumAggregate: ["id"],
  Render_jobMinAggregate: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobMaxAggregate: ["id", "createdAt", "jobId", "serviceId"],
  ResourceCount: ["market_group", "resource_price"],
  ResourceCountAggregate: ["id", "createdAt", "name", "slug", "categoryId", "_all"],
  ResourceAvgAggregate: ["id", "categoryId"],
  ResourceSumAggregate: ["id", "categoryId"],
  ResourceMinAggregate: ["id", "createdAt", "name", "slug", "categoryId"],
  ResourceMaxAggregate: ["id", "createdAt", "name", "slug", "categoryId"],
  Resource_priceCountAggregate: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "_all"],
  Resource_priceAvgAggregate: ["id", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceSumAggregate: ["id", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceMinAggregate: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceMaxAggregate: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  TransactionCountAggregate: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "_all"],
  TransactionAvgAggregate: ["id", "tradeRatioD18", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionSumAggregate: ["id", "tradeRatioD18", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionMinAggregate: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionMaxAggregate: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  CreateManyAndReturnCache_candle: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  CreateManyAndReturnCache_param: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  CreateManyAndReturnCategory: ["id", "createdAt", "name", "slug"],
  CreateManyAndReturnCollateral_transfer: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  CreateManyAndReturnCrypto_prices: ["id", "ticker", "price", "timestamp"],
  CreateManyAndReturnEvent: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "market_group"],
  CreateManyAndReturnMarket: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group"],
  CreateManyAndReturnMarket_group: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "resource", "category"],
  CreateManyAndReturnMarket_price: ["id", "createdAt", "timestamp", "value"],
  CreateManyAndReturnMigrations: ["id", "timestamp", "name"],
  CreateManyAndReturnPosition: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "market"],
  CreateManyAndReturnRender_job: ["id", "createdAt", "jobId", "serviceId"],
  CreateManyAndReturnResource: ["id", "createdAt", "name", "slug", "categoryId", "category"],
  CreateManyAndReturnResource_price: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "resource"],
  CreateManyAndReturnTransaction: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "collateral_transfer", "market_price", "event", "position"]
};

type OutputTypesNames = keyof typeof outputTypes;

type OutputTypeFieldNames<TOutput extends OutputTypesNames> = Exclude<
  keyof typeof outputTypes[TOutput]["prototype"],
  number | symbol
>;

type OutputTypeFieldsConfig<
  TOutput extends OutputTypesNames
> = FieldsConfig<OutputTypeFieldNames<TOutput>>;

export type OutputTypeConfig<TOutput extends OutputTypesNames> = {
  class?: ClassDecorator[];
  fields?: OutputTypeFieldsConfig<TOutput>;
};

export type OutputTypesEnhanceMap = {
  [TOutput in OutputTypesNames]?: OutputTypeConfig<TOutput>;
};

export function applyOutputTypesEnhanceMap(
  outputTypesEnhanceMap: OutputTypesEnhanceMap,
) {
  for (const outputTypeEnhanceMapKey of Object.keys(outputTypesEnhanceMap)) {
    const outputTypeName = outputTypeEnhanceMapKey as keyof typeof outputTypesEnhanceMap;
    const typeConfig = outputTypesEnhanceMap[outputTypeName]!;
    const typeClass = outputTypes[outputTypeName];
    const typeTarget = typeClass.prototype;
    applyTypeClassEnhanceConfig(
      typeConfig,
      typeClass,
      typeTarget,
      outputsInfo[outputTypeName as keyof typeof outputsInfo],
    );
  }
}

const inputsInfo = {
  Cache_candleWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleOrderByWithRelationInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleWhereUniqueInput: ["id", "candleType_interval_timestamp_resourceSlug_marketIdx_trailingAvgTime", "AND", "OR", "NOT", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleOrderByWithAggregationInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId", "_count", "_avg", "_max", "_min", "_sum"],
  Cache_candleScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_paramWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramOrderByWithRelationInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramWhereUniqueInput: ["id", "paramName", "AND", "OR", "NOT", "createdAt", "paramValueNumber", "paramValueString"],
  Cache_paramOrderByWithAggregationInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString", "_count", "_avg", "_max", "_min", "_sum"],
  Cache_paramScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  CategoryWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "name", "slug", "market_group", "resource"],
  CategoryOrderByWithRelationInput: ["id", "createdAt", "name", "slug", "market_group", "resource"],
  CategoryWhereUniqueInput: ["id", "name", "slug", "AND", "OR", "NOT", "createdAt", "market_group", "resource"],
  CategoryOrderByWithAggregationInput: ["id", "createdAt", "name", "slug", "_count", "_avg", "_max", "_min", "_sum"],
  CategoryScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "name", "slug"],
  Collateral_transferWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "transactionHash", "timestamp", "owner", "collateral", "transaction"],
  Collateral_transferOrderByWithRelationInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral", "transaction"],
  Collateral_transferWhereUniqueInput: ["id", "transactionHash", "AND", "OR", "NOT", "createdAt", "timestamp", "owner", "collateral", "transaction"],
  Collateral_transferOrderByWithAggregationInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral", "_count", "_avg", "_max", "_min", "_sum"],
  Collateral_transferScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Crypto_pricesWhereInput: ["AND", "OR", "NOT", "id", "ticker", "price", "timestamp"],
  Crypto_pricesOrderByWithRelationInput: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesWhereUniqueInput: ["id", "AND", "OR", "NOT", "ticker", "price", "timestamp"],
  Crypto_pricesOrderByWithAggregationInput: ["id", "ticker", "price", "timestamp", "_count", "_avg", "_max", "_min", "_sum"],
  Crypto_pricesScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "ticker", "price", "timestamp"],
  EventWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "market_group", "transaction"],
  EventOrderByWithRelationInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "market_group", "transaction"],
  EventWhereUniqueInput: ["id", "transactionHash_marketGroupId_blockNumber_logIndex", "AND", "OR", "NOT", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "market_group", "transaction"],
  EventOrderByWithAggregationInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId", "_count", "_avg", "_max", "_min", "_sum"],
  EventScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId"],
  MarketWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group", "position"],
  MarketOrderByWithRelationInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group", "position"],
  MarketWhereUniqueInput: ["id", "marketGroupId_marketId", "AND", "OR", "NOT", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group", "position"],
  MarketOrderByWithAggregationInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "_count", "_avg", "_max", "_min", "_sum"],
  MarketScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  Market_groupWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource", "category"],
  Market_groupOrderByWithRelationInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource", "category"],
  Market_groupWhereUniqueInput: ["id", "address_chainId", "AND", "OR", "NOT", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource", "category"],
  Market_groupOrderByWithAggregationInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "_count", "_avg", "_max", "_min", "_sum"],
  Market_groupScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_priceWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "timestamp", "value", "transaction"],
  Market_priceOrderByWithRelationInput: ["id", "createdAt", "timestamp", "value", "transaction"],
  Market_priceWhereUniqueInput: ["id", "AND", "OR", "NOT", "createdAt", "timestamp", "value", "transaction"],
  Market_priceOrderByWithAggregationInput: ["id", "createdAt", "timestamp", "value", "_count", "_avg", "_max", "_min", "_sum"],
  Market_priceScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "timestamp", "value"],
  MigrationsWhereInput: ["AND", "OR", "NOT", "id", "timestamp", "name"],
  MigrationsOrderByWithRelationInput: ["id", "timestamp", "name"],
  MigrationsWhereUniqueInput: ["id", "AND", "OR", "NOT", "timestamp", "name"],
  MigrationsOrderByWithAggregationInput: ["id", "timestamp", "name", "_count", "_avg", "_max", "_min", "_sum"],
  MigrationsScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "timestamp", "name"],
  PositionWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "market", "transaction"],
  PositionOrderByWithRelationInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "market", "transaction"],
  PositionWhereUniqueInput: ["id", "positionId_marketId", "AND", "OR", "NOT", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "market", "transaction"],
  PositionOrderByWithAggregationInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId", "_count", "_avg", "_max", "_min", "_sum"],
  PositionScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  Render_jobWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "jobId", "serviceId"],
  Render_jobOrderByWithRelationInput: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobWhereUniqueInput: ["id", "AND", "OR", "NOT", "createdAt", "jobId", "serviceId"],
  Render_jobOrderByWithAggregationInput: ["id", "createdAt", "jobId", "serviceId", "_count", "_avg", "_max", "_min", "_sum"],
  Render_jobScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "jobId", "serviceId"],
  ResourceWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "name", "slug", "categoryId", "market_group", "category", "resource_price"],
  ResourceOrderByWithRelationInput: ["id", "createdAt", "name", "slug", "categoryId", "market_group", "category", "resource_price"],
  ResourceWhereUniqueInput: ["id", "name", "slug", "AND", "OR", "NOT", "createdAt", "categoryId", "market_group", "category", "resource_price"],
  ResourceOrderByWithAggregationInput: ["id", "createdAt", "name", "slug", "categoryId", "_count", "_avg", "_max", "_min", "_sum"],
  ResourceScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "name", "slug", "categoryId"],
  Resource_priceWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "resource"],
  Resource_priceOrderByWithRelationInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "resource"],
  Resource_priceWhereUniqueInput: ["id", "resourceId_timestamp", "AND", "OR", "NOT", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "resource"],
  Resource_priceOrderByWithAggregationInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId", "_count", "_avg", "_max", "_min", "_sum"],
  Resource_priceScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  TransactionWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "collateral_transfer", "market_price", "event", "position"],
  TransactionOrderByWithRelationInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "collateral_transfer", "market_price", "event", "position"],
  TransactionWhereUniqueInput: ["id", "eventId", "marketPriceId", "collateralTransferId", "AND", "OR", "NOT", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "positionId", "collateral_transfer", "market_price", "event", "position"],
  TransactionOrderByWithAggregationInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId", "_count", "_avg", "_max", "_min", "_sum"],
  TransactionScalarWhereWithAggregatesInput: ["AND", "OR", "NOT", "id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  Cache_candleCreateInput: ["createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleUpdateInput: ["createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleCreateManyInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleUpdateManyMutationInput: ["createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_paramCreateInput: ["createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramUpdateInput: ["createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramCreateManyInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramUpdateManyMutationInput: ["createdAt", "paramName", "paramValueNumber", "paramValueString"],
  CategoryCreateInput: ["createdAt", "name", "slug", "market_group", "resource"],
  CategoryUpdateInput: ["createdAt", "name", "slug", "market_group", "resource"],
  CategoryCreateManyInput: ["id", "createdAt", "name", "slug"],
  CategoryUpdateManyMutationInput: ["createdAt", "name", "slug"],
  Collateral_transferCreateInput: ["createdAt", "transactionHash", "timestamp", "owner", "collateral", "transaction"],
  Collateral_transferUpdateInput: ["createdAt", "transactionHash", "timestamp", "owner", "collateral", "transaction"],
  Collateral_transferCreateManyInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferUpdateManyMutationInput: ["createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Crypto_pricesCreateInput: ["ticker", "price", "timestamp"],
  Crypto_pricesUpdateInput: ["ticker", "price", "timestamp"],
  Crypto_pricesCreateManyInput: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesUpdateManyMutationInput: ["ticker", "price", "timestamp"],
  EventCreateInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "market_group", "transaction"],
  EventUpdateInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "market_group", "transaction"],
  EventCreateManyInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId"],
  EventUpdateManyMutationInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData"],
  MarketCreateInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group", "position"],
  MarketUpdateInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group", "position"],
  MarketCreateManyInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  MarketUpdateManyMutationInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  Market_groupCreateInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource", "category"],
  Market_groupUpdateInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource", "category"],
  Market_groupCreateManyInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_groupUpdateManyMutationInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_priceCreateInput: ["createdAt", "timestamp", "value", "transaction"],
  Market_priceUpdateInput: ["createdAt", "timestamp", "value", "transaction"],
  Market_priceCreateManyInput: ["id", "createdAt", "timestamp", "value"],
  Market_priceUpdateManyMutationInput: ["createdAt", "timestamp", "value"],
  MigrationsCreateInput: ["timestamp", "name"],
  MigrationsUpdateInput: ["timestamp", "name"],
  MigrationsCreateManyInput: ["id", "timestamp", "name"],
  MigrationsUpdateManyMutationInput: ["timestamp", "name"],
  PositionCreateInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "market", "transaction"],
  PositionUpdateInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "market", "transaction"],
  PositionCreateManyInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionUpdateManyMutationInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral"],
  Render_jobCreateInput: ["createdAt", "jobId", "serviceId"],
  Render_jobUpdateInput: ["createdAt", "jobId", "serviceId"],
  Render_jobCreateManyInput: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobUpdateManyMutationInput: ["createdAt", "jobId", "serviceId"],
  ResourceCreateInput: ["createdAt", "name", "slug", "market_group", "category", "resource_price"],
  ResourceUpdateInput: ["createdAt", "name", "slug", "market_group", "category", "resource_price"],
  ResourceCreateManyInput: ["id", "createdAt", "name", "slug", "categoryId"],
  ResourceUpdateManyMutationInput: ["createdAt", "name", "slug"],
  Resource_priceCreateInput: ["createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resource"],
  Resource_priceUpdateInput: ["createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resource"],
  Resource_priceCreateManyInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceUpdateManyMutationInput: ["createdAt", "blockNumber", "timestamp", "value", "used", "feePaid"],
  TransactionCreateInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "event", "position"],
  TransactionUpdateInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "event", "position"],
  TransactionCreateManyInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionUpdateManyMutationInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken"],
  IntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  DateTimeFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  StringFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not"],
  IntNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  StringNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not"],
  DecimalNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  SortOrderInput: ["sort", "nulls"],
  cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput: ["candleType", "interval", "timestamp", "resourceSlug", "marketIdx", "trailingAvgTime"],
  Cache_candleCountOrderByAggregateInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleAvgOrderByAggregateInput: ["id", "interval", "trailingAvgTime", "marketIdx", "timestamp", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "chainId", "marketId"],
  Cache_candleMaxOrderByAggregateInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleMinOrderByAggregateInput: ["id", "createdAt", "candleType", "interval", "trailingAvgTime", "resourceSlug", "marketIdx", "timestamp", "open", "high", "low", "close", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "address", "chainId", "marketId"],
  Cache_candleSumOrderByAggregateInput: ["id", "interval", "trailingAvgTime", "marketIdx", "timestamp", "endTimestamp", "lastUpdatedTimestamp", "sumUsed", "sumFeePaid", "trailingStartTimestamp", "chainId", "marketId"],
  IntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  DateTimeWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
  StringWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not", "_count", "_min", "_max"],
  IntNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  StringNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "not", "_count", "_min", "_max"],
  DecimalNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  DecimalFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  Cache_paramCountOrderByAggregateInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramAvgOrderByAggregateInput: ["id", "paramValueNumber"],
  Cache_paramMaxOrderByAggregateInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramMinOrderByAggregateInput: ["id", "createdAt", "paramName", "paramValueNumber", "paramValueString"],
  Cache_paramSumOrderByAggregateInput: ["id", "paramValueNumber"],
  DecimalWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  Market_groupListRelationFilter: ["every", "some", "none"],
  ResourceListRelationFilter: ["every", "some", "none"],
  Market_groupOrderByRelationAggregateInput: ["_count"],
  ResourceOrderByRelationAggregateInput: ["_count"],
  CategoryCountOrderByAggregateInput: ["id", "createdAt", "name", "slug"],
  CategoryAvgOrderByAggregateInput: ["id"],
  CategoryMaxOrderByAggregateInput: ["id", "createdAt", "name", "slug"],
  CategoryMinOrderByAggregateInput: ["id", "createdAt", "name", "slug"],
  CategorySumOrderByAggregateInput: ["id"],
  TransactionNullableRelationFilter: ["is", "isNot"],
  Collateral_transferCountOrderByAggregateInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferAvgOrderByAggregateInput: ["id", "timestamp", "collateral"],
  Collateral_transferMaxOrderByAggregateInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferMinOrderByAggregateInput: ["id", "createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferSumOrderByAggregateInput: ["id", "timestamp", "collateral"],
  FloatFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  Crypto_pricesCountOrderByAggregateInput: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesAvgOrderByAggregateInput: ["id", "price"],
  Crypto_pricesMaxOrderByAggregateInput: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesMinOrderByAggregateInput: ["id", "ticker", "price", "timestamp"],
  Crypto_pricesSumOrderByAggregateInput: ["id", "price"],
  FloatWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  BigIntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  JsonFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not"],
  Market_groupNullableRelationFilter: ["is", "isNot"],
  eventTransactionHashMarketGroupIdBlockNumberLogIndexCompoundUniqueInput: ["transactionHash", "marketGroupId", "blockNumber", "logIndex"],
  EventCountOrderByAggregateInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId"],
  EventAvgOrderByAggregateInput: ["id", "blockNumber", "timestamp", "logIndex", "marketGroupId"],
  EventMaxOrderByAggregateInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "marketGroupId"],
  EventMinOrderByAggregateInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "marketGroupId"],
  EventSumOrderByAggregateInput: ["id", "blockNumber", "timestamp", "logIndex", "marketGroupId"],
  BigIntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  JsonWithAggregatesFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
  BoolNullableFilter: ["equals", "not"],
  BoolFilter: ["equals", "not"],
  PositionListRelationFilter: ["every", "some", "none"],
  PositionOrderByRelationAggregateInput: ["_count"],
  marketMarketGroupIdMarketIdCompoundUniqueInput: ["marketGroupId", "marketId"],
  MarketCountOrderByAggregateInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  MarketAvgOrderByAggregateInput: ["id", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount"],
  MarketMaxOrderByAggregateInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  MarketMinOrderByAggregateInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  MarketSumOrderByAggregateInput: ["id", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount"],
  BoolNullableWithAggregatesFilter: ["equals", "not", "_count", "_min", "_max"],
  BoolWithAggregatesFilter: ["equals", "not", "_count", "_min", "_max"],
  EventListRelationFilter: ["every", "some", "none"],
  MarketListRelationFilter: ["every", "some", "none"],
  ResourceNullableRelationFilter: ["is", "isNot"],
  CategoryNullableRelationFilter: ["is", "isNot"],
  EventOrderByRelationAggregateInput: ["_count"],
  MarketOrderByRelationAggregateInput: ["_count"],
  market_groupAddressChainIdCompoundUniqueInput: ["address", "chainId"],
  Market_groupCountOrderByAggregateInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_groupAvgOrderByAggregateInput: ["id", "chainId", "deployTimestamp", "deployTxnBlockNumber", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount", "categoryId", "collateralDecimals", "minTradeSize"],
  Market_groupMaxOrderByAggregateInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_groupMinOrderByAggregateInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Market_groupSumOrderByAggregateInput: ["id", "chainId", "deployTimestamp", "deployTxnBlockNumber", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondamount", "categoryId", "collateralDecimals", "minTradeSize"],
  Market_priceCountOrderByAggregateInput: ["id", "createdAt", "timestamp", "value"],
  Market_priceAvgOrderByAggregateInput: ["id", "timestamp", "value"],
  Market_priceMaxOrderByAggregateInput: ["id", "createdAt", "timestamp", "value"],
  Market_priceMinOrderByAggregateInput: ["id", "createdAt", "timestamp", "value"],
  Market_priceSumOrderByAggregateInput: ["id", "timestamp", "value"],
  MigrationsCountOrderByAggregateInput: ["id", "timestamp", "name"],
  MigrationsAvgOrderByAggregateInput: ["id", "timestamp"],
  MigrationsMaxOrderByAggregateInput: ["id", "timestamp", "name"],
  MigrationsMinOrderByAggregateInput: ["id", "timestamp", "name"],
  MigrationsSumOrderByAggregateInput: ["id", "timestamp"],
  MarketNullableRelationFilter: ["is", "isNot"],
  TransactionListRelationFilter: ["every", "some", "none"],
  TransactionOrderByRelationAggregateInput: ["_count"],
  positionPositionIdMarketIdCompoundUniqueInput: ["positionId", "marketId"],
  PositionCountOrderByAggregateInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionAvgOrderByAggregateInput: ["id", "positionId", "highPriceTick", "lowPriceTick", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionMaxOrderByAggregateInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionMinOrderByAggregateInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  PositionSumOrderByAggregateInput: ["id", "positionId", "highPriceTick", "lowPriceTick", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  Render_jobCountOrderByAggregateInput: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobAvgOrderByAggregateInput: ["id"],
  Render_jobMaxOrderByAggregateInput: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobMinOrderByAggregateInput: ["id", "createdAt", "jobId", "serviceId"],
  Render_jobSumOrderByAggregateInput: ["id"],
  Resource_priceListRelationFilter: ["every", "some", "none"],
  Resource_priceOrderByRelationAggregateInput: ["_count"],
  ResourceCountOrderByAggregateInput: ["id", "createdAt", "name", "slug", "categoryId"],
  ResourceAvgOrderByAggregateInput: ["id", "categoryId"],
  ResourceMaxOrderByAggregateInput: ["id", "createdAt", "name", "slug", "categoryId"],
  ResourceMinOrderByAggregateInput: ["id", "createdAt", "name", "slug", "categoryId"],
  ResourceSumOrderByAggregateInput: ["id", "categoryId"],
  resource_priceResourceIdTimestampCompoundUniqueInput: ["resourceId", "timestamp"],
  Resource_priceCountOrderByAggregateInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceAvgOrderByAggregateInput: ["id", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceMaxOrderByAggregateInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceMinOrderByAggregateInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Resource_priceSumOrderByAggregateInput: ["id", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  Enumtransaction_type_enumFilter: ["equals", "in", "notIn", "not"],
  Collateral_transferNullableRelationFilter: ["is", "isNot"],
  Market_priceNullableRelationFilter: ["is", "isNot"],
  EventNullableRelationFilter: ["is", "isNot"],
  PositionNullableRelationFilter: ["is", "isNot"],
  TransactionCountOrderByAggregateInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionAvgOrderByAggregateInput: ["id", "tradeRatioD18", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionMaxOrderByAggregateInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionMinOrderByAggregateInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  TransactionSumOrderByAggregateInput: ["id", "tradeRatioD18", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  Enumtransaction_type_enumWithAggregatesFilter: ["equals", "in", "notIn", "not", "_count", "_min", "_max"],
  DateTimeFieldUpdateOperationsInput: ["set"],
  StringFieldUpdateOperationsInput: ["set"],
  IntFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  NullableIntFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  NullableStringFieldUpdateOperationsInput: ["set"],
  NullableDecimalFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  DecimalFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  Market_groupCreateNestedManyWithoutCategoryInput: ["create", "connectOrCreate", "createMany", "connect"],
  ResourceCreateNestedManyWithoutCategoryInput: ["create", "connectOrCreate", "createMany", "connect"],
  Market_groupUpdateManyWithoutCategoryNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  ResourceUpdateManyWithoutCategoryNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  TransactionCreateNestedOneWithoutCollateral_transferInput: ["create", "connectOrCreate", "connect"],
  TransactionUpdateOneWithoutCollateral_transferNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  FloatFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  Market_groupCreateNestedOneWithoutEventInput: ["create", "connectOrCreate", "connect"],
  TransactionCreateNestedOneWithoutEventInput: ["create", "connectOrCreate", "connect"],
  BigIntFieldUpdateOperationsInput: ["set", "increment", "decrement", "multiply", "divide"],
  Market_groupUpdateOneWithoutEventNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  TransactionUpdateOneWithoutEventNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  Market_groupCreateNestedOneWithoutMarketInput: ["create", "connectOrCreate", "connect"],
  PositionCreateNestedManyWithoutMarketInput: ["create", "connectOrCreate", "createMany", "connect"],
  NullableBoolFieldUpdateOperationsInput: ["set"],
  BoolFieldUpdateOperationsInput: ["set"],
  Market_groupUpdateOneWithoutMarketNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  PositionUpdateManyWithoutMarketNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  EventCreateNestedManyWithoutMarket_groupInput: ["create", "connectOrCreate", "createMany", "connect"],
  MarketCreateNestedManyWithoutMarket_groupInput: ["create", "connectOrCreate", "createMany", "connect"],
  ResourceCreateNestedOneWithoutMarket_groupInput: ["create", "connectOrCreate", "connect"],
  CategoryCreateNestedOneWithoutMarket_groupInput: ["create", "connectOrCreate", "connect"],
  EventUpdateManyWithoutMarket_groupNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  MarketUpdateManyWithoutMarket_groupNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  ResourceUpdateOneWithoutMarket_groupNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  CategoryUpdateOneWithoutMarket_groupNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  TransactionCreateNestedOneWithoutMarket_priceInput: ["create", "connectOrCreate", "connect"],
  TransactionUpdateOneWithoutMarket_priceNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  MarketCreateNestedOneWithoutPositionInput: ["create", "connectOrCreate", "connect"],
  TransactionCreateNestedManyWithoutPositionInput: ["create", "connectOrCreate", "createMany", "connect"],
  MarketUpdateOneWithoutPositionNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  TransactionUpdateManyWithoutPositionNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  Market_groupCreateNestedManyWithoutResourceInput: ["create", "connectOrCreate", "createMany", "connect"],
  CategoryCreateNestedOneWithoutResourceInput: ["create", "connectOrCreate", "connect"],
  Resource_priceCreateNestedManyWithoutResourceInput: ["create", "connectOrCreate", "createMany", "connect"],
  Market_groupUpdateManyWithoutResourceNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  CategoryUpdateOneWithoutResourceNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  Resource_priceUpdateManyWithoutResourceNestedInput: ["create", "connectOrCreate", "upsert", "createMany", "set", "disconnect", "delete", "connect", "update", "updateMany", "deleteMany"],
  ResourceCreateNestedOneWithoutResource_priceInput: ["create", "connectOrCreate", "connect"],
  ResourceUpdateOneWithoutResource_priceNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  Collateral_transferCreateNestedOneWithoutTransactionInput: ["create", "connectOrCreate", "connect"],
  Market_priceCreateNestedOneWithoutTransactionInput: ["create", "connectOrCreate", "connect"],
  EventCreateNestedOneWithoutTransactionInput: ["create", "connectOrCreate", "connect"],
  PositionCreateNestedOneWithoutTransactionInput: ["create", "connectOrCreate", "connect"],
  Enumtransaction_type_enumFieldUpdateOperationsInput: ["set"],
  Collateral_transferUpdateOneWithoutTransactionNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  Market_priceUpdateOneWithoutTransactionNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  EventUpdateOneWithoutTransactionNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  PositionUpdateOneWithoutTransactionNestedInput: ["create", "connectOrCreate", "upsert", "disconnect", "delete", "connect", "update"],
  NestedIntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedDateTimeFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedStringFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not"],
  NestedIntNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedStringNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not"],
  NestedDecimalNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedIntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedFloatFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedDateTimeWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_min", "_max"],
  NestedStringWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not", "_count", "_min", "_max"],
  NestedIntNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedFloatNullableFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedStringNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "not", "_count", "_min", "_max"],
  NestedDecimalNullableWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedDecimalFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedDecimalWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedFloatWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedBigIntFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not"],
  NestedBigIntWithAggregatesFilter: ["equals", "in", "notIn", "lt", "lte", "gt", "gte", "not", "_count", "_avg", "_sum", "_min", "_max"],
  NestedJsonFilter: ["equals", "path", "string_contains", "string_starts_with", "string_ends_with", "array_contains", "array_starts_with", "array_ends_with", "lt", "lte", "gt", "gte", "not"],
  NestedBoolNullableFilter: ["equals", "not"],
  NestedBoolFilter: ["equals", "not"],
  NestedBoolNullableWithAggregatesFilter: ["equals", "not", "_count", "_min", "_max"],
  NestedBoolWithAggregatesFilter: ["equals", "not", "_count", "_min", "_max"],
  NestedEnumtransaction_type_enumFilter: ["equals", "in", "notIn", "not"],
  NestedEnumtransaction_type_enumWithAggregatesFilter: ["equals", "in", "notIn", "not", "_count", "_min", "_max"],
  Market_groupCreateWithoutCategoryInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource"],
  Market_groupCreateOrConnectWithoutCategoryInput: ["where", "create"],
  Market_groupCreateManyCategoryInputEnvelope: ["data", "skipDuplicates"],
  ResourceCreateWithoutCategoryInput: ["createdAt", "name", "slug", "market_group", "resource_price"],
  ResourceCreateOrConnectWithoutCategoryInput: ["where", "create"],
  ResourceCreateManyCategoryInputEnvelope: ["data", "skipDuplicates"],
  Market_groupUpsertWithWhereUniqueWithoutCategoryInput: ["where", "update", "create"],
  Market_groupUpdateWithWhereUniqueWithoutCategoryInput: ["where", "data"],
  Market_groupUpdateManyWithWhereWithoutCategoryInput: ["where", "data"],
  Market_groupScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  ResourceUpsertWithWhereUniqueWithoutCategoryInput: ["where", "update", "create"],
  ResourceUpdateWithWhereUniqueWithoutCategoryInput: ["where", "data"],
  ResourceUpdateManyWithWhereWithoutCategoryInput: ["where", "data"],
  ResourceScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "name", "slug", "categoryId"],
  TransactionCreateWithoutCollateral_transferInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "market_price", "event", "position"],
  TransactionCreateOrConnectWithoutCollateral_transferInput: ["where", "create"],
  TransactionUpsertWithoutCollateral_transferInput: ["update", "create", "where"],
  TransactionUpdateToOneWithWhereWithoutCollateral_transferInput: ["where", "data"],
  TransactionUpdateWithoutCollateral_transferInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "market_price", "event", "position"],
  Market_groupCreateWithoutEventInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "market", "resource", "category"],
  Market_groupCreateOrConnectWithoutEventInput: ["where", "create"],
  TransactionCreateWithoutEventInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "position"],
  TransactionCreateOrConnectWithoutEventInput: ["where", "create"],
  Market_groupUpsertWithoutEventInput: ["update", "create", "where"],
  Market_groupUpdateToOneWithWhereWithoutEventInput: ["where", "data"],
  Market_groupUpdateWithoutEventInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "market", "resource", "category"],
  TransactionUpsertWithoutEventInput: ["update", "create", "where"],
  TransactionUpdateToOneWithWhereWithoutEventInput: ["where", "data"],
  TransactionUpdateWithoutEventInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "position"],
  Market_groupCreateWithoutMarketInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "resource", "category"],
  Market_groupCreateOrConnectWithoutMarketInput: ["where", "create"],
  PositionCreateWithoutMarketInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "transaction"],
  PositionCreateOrConnectWithoutMarketInput: ["where", "create"],
  PositionCreateManyMarketInputEnvelope: ["data", "skipDuplicates"],
  Market_groupUpsertWithoutMarketInput: ["update", "create", "where"],
  Market_groupUpdateToOneWithWhereWithoutMarketInput: ["where", "data"],
  Market_groupUpdateWithoutMarketInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "resource", "category"],
  PositionUpsertWithWhereUniqueWithoutMarketInput: ["where", "update", "create"],
  PositionUpdateWithWhereUniqueWithoutMarketInput: ["where", "data"],
  PositionUpdateManyWithWhereWithoutMarketInput: ["where", "data"],
  PositionScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "marketId"],
  EventCreateWithoutMarket_groupInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "transaction"],
  EventCreateOrConnectWithoutMarket_groupInput: ["where", "create"],
  EventCreateManyMarket_groupInputEnvelope: ["data", "skipDuplicates"],
  MarketCreateWithoutMarket_groupInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "position"],
  MarketCreateOrConnectWithoutMarket_groupInput: ["where", "create"],
  MarketCreateManyMarket_groupInputEnvelope: ["data", "skipDuplicates"],
  ResourceCreateWithoutMarket_groupInput: ["createdAt", "name", "slug", "category", "resource_price"],
  ResourceCreateOrConnectWithoutMarket_groupInput: ["where", "create"],
  CategoryCreateWithoutMarket_groupInput: ["createdAt", "name", "slug", "resource"],
  CategoryCreateOrConnectWithoutMarket_groupInput: ["where", "create"],
  EventUpsertWithWhereUniqueWithoutMarket_groupInput: ["where", "update", "create"],
  EventUpdateWithWhereUniqueWithoutMarket_groupInput: ["where", "data"],
  EventUpdateManyWithWhereWithoutMarket_groupInput: ["where", "data"],
  EventScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "marketGroupId"],
  MarketUpsertWithWhereUniqueWithoutMarket_groupInput: ["where", "update", "create"],
  MarketUpdateWithWhereUniqueWithoutMarket_groupInput: ["where", "data"],
  MarketUpdateManyWithWhereWithoutMarket_groupInput: ["where", "data"],
  MarketScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketGroupId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  ResourceUpsertWithoutMarket_groupInput: ["update", "create", "where"],
  ResourceUpdateToOneWithWhereWithoutMarket_groupInput: ["where", "data"],
  ResourceUpdateWithoutMarket_groupInput: ["createdAt", "name", "slug", "category", "resource_price"],
  CategoryUpsertWithoutMarket_groupInput: ["update", "create", "where"],
  CategoryUpdateToOneWithWhereWithoutMarket_groupInput: ["where", "data"],
  CategoryUpdateWithoutMarket_groupInput: ["createdAt", "name", "slug", "resource"],
  TransactionCreateWithoutMarket_priceInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "event", "position"],
  TransactionCreateOrConnectWithoutMarket_priceInput: ["where", "create"],
  TransactionUpsertWithoutMarket_priceInput: ["update", "create", "where"],
  TransactionUpdateToOneWithWhereWithoutMarket_priceInput: ["where", "data"],
  TransactionUpdateWithoutMarket_priceInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "event", "position"],
  MarketCreateWithoutPositionInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group"],
  MarketCreateOrConnectWithoutPositionInput: ["where", "create"],
  TransactionCreateWithoutPositionInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "event"],
  TransactionCreateOrConnectWithoutPositionInput: ["where", "create"],
  TransactionCreateManyPositionInputEnvelope: ["data", "skipDuplicates"],
  MarketUpsertWithoutPositionInput: ["update", "create", "where"],
  MarketUpdateToOneWithWhereWithoutPositionInput: ["where", "data"],
  MarketUpdateWithoutPositionInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "market_group"],
  TransactionUpsertWithWhereUniqueWithoutPositionInput: ["where", "update", "create"],
  TransactionUpdateWithWhereUniqueWithoutPositionInput: ["where", "data"],
  TransactionUpdateManyWithWhereWithoutPositionInput: ["where", "data"],
  TransactionScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "positionId", "marketPriceId", "collateralTransferId"],
  Market_groupCreateWithoutResourceInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "category"],
  Market_groupCreateOrConnectWithoutResourceInput: ["where", "create"],
  Market_groupCreateManyResourceInputEnvelope: ["data", "skipDuplicates"],
  CategoryCreateWithoutResourceInput: ["createdAt", "name", "slug", "market_group"],
  CategoryCreateOrConnectWithoutResourceInput: ["where", "create"],
  Resource_priceCreateWithoutResourceInput: ["createdAt", "blockNumber", "timestamp", "value", "used", "feePaid"],
  Resource_priceCreateOrConnectWithoutResourceInput: ["where", "create"],
  Resource_priceCreateManyResourceInputEnvelope: ["data", "skipDuplicates"],
  Market_groupUpsertWithWhereUniqueWithoutResourceInput: ["where", "update", "create"],
  Market_groupUpdateWithWhereUniqueWithoutResourceInput: ["where", "data"],
  Market_groupUpdateManyWithWhereWithoutResourceInput: ["where", "data"],
  CategoryUpsertWithoutResourceInput: ["update", "create", "where"],
  CategoryUpdateToOneWithWhereWithoutResourceInput: ["where", "data"],
  CategoryUpdateWithoutResourceInput: ["createdAt", "name", "slug", "market_group"],
  Resource_priceUpsertWithWhereUniqueWithoutResourceInput: ["where", "update", "create"],
  Resource_priceUpdateWithWhereUniqueWithoutResourceInput: ["where", "data"],
  Resource_priceUpdateManyWithWhereWithoutResourceInput: ["where", "data"],
  Resource_priceScalarWhereInput: ["AND", "OR", "NOT", "id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid", "resourceId"],
  ResourceCreateWithoutResource_priceInput: ["createdAt", "name", "slug", "market_group", "category"],
  ResourceCreateOrConnectWithoutResource_priceInput: ["where", "create"],
  ResourceUpsertWithoutResource_priceInput: ["update", "create", "where"],
  ResourceUpdateToOneWithWhereWithoutResource_priceInput: ["where", "data"],
  ResourceUpdateWithoutResource_priceInput: ["createdAt", "name", "slug", "market_group", "category"],
  Collateral_transferCreateWithoutTransactionInput: ["createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Collateral_transferCreateOrConnectWithoutTransactionInput: ["where", "create"],
  Market_priceCreateWithoutTransactionInput: ["createdAt", "timestamp", "value"],
  Market_priceCreateOrConnectWithoutTransactionInput: ["where", "create"],
  EventCreateWithoutTransactionInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "market_group"],
  EventCreateOrConnectWithoutTransactionInput: ["where", "create"],
  PositionCreateWithoutTransactionInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "market"],
  PositionCreateOrConnectWithoutTransactionInput: ["where", "create"],
  Collateral_transferUpsertWithoutTransactionInput: ["update", "create", "where"],
  Collateral_transferUpdateToOneWithWhereWithoutTransactionInput: ["where", "data"],
  Collateral_transferUpdateWithoutTransactionInput: ["createdAt", "transactionHash", "timestamp", "owner", "collateral"],
  Market_priceUpsertWithoutTransactionInput: ["update", "create", "where"],
  Market_priceUpdateToOneWithWhereWithoutTransactionInput: ["where", "data"],
  Market_priceUpdateWithoutTransactionInput: ["createdAt", "timestamp", "value"],
  EventUpsertWithoutTransactionInput: ["update", "create", "where"],
  EventUpdateToOneWithWhereWithoutTransactionInput: ["where", "data"],
  EventUpdateWithoutTransactionInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "market_group"],
  PositionUpsertWithoutTransactionInput: ["update", "create", "where"],
  PositionUpdateToOneWithWhereWithoutTransactionInput: ["where", "data"],
  PositionUpdateWithoutTransactionInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "market"],
  Market_groupCreateManyCategoryInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "resourceId", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  ResourceCreateManyCategoryInput: ["id", "createdAt", "name", "slug"],
  Market_groupUpdateWithoutCategoryInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "resource"],
  ResourceUpdateWithoutCategoryInput: ["createdAt", "name", "slug", "market_group", "resource_price"],
  PositionCreateManyMarketInput: ["id", "createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral"],
  PositionUpdateWithoutMarketInput: ["createdAt", "positionId", "owner", "isLP", "highPriceTick", "lowPriceTick", "isSettled", "lpBaseToken", "lpQuoteToken", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "transaction"],
  EventCreateManyMarket_groupInput: ["id", "createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData"],
  MarketCreateManyMarket_groupInput: ["id", "createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules"],
  EventUpdateWithoutMarket_groupInput: ["createdAt", "blockNumber", "transactionHash", "timestamp", "logIndex", "logData", "transaction"],
  MarketUpdateWithoutMarket_groupInput: ["createdAt", "marketId", "startTimestamp", "endTimestamp", "startingSqrtPriceX96", "settlementPriceD18", "settled", "baseAssetMinPriceTick", "baseAssetMaxPriceTick", "minPriceD18", "maxPriceD18", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "public", "question", "poolAddress", "optionName", "rules", "position"],
  TransactionCreateManyPositionInput: ["id", "createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "eventId", "marketPriceId", "collateralTransferId"],
  TransactionUpdateWithoutPositionInput: ["createdAt", "tradeRatioD18", "type", "baseToken", "quoteToken", "borrowedBaseToken", "borrowedQuoteToken", "collateral", "lpBaseDeltaToken", "lpQuoteDeltaToken", "collateral_transfer", "market_price", "event"],
  Market_groupCreateManyResourceInput: ["id", "createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "categoryId", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize"],
  Resource_priceCreateManyResourceInput: ["id", "createdAt", "blockNumber", "timestamp", "value", "used", "feePaid"],
  Market_groupUpdateWithoutResourceInput: ["createdAt", "address", "vaultAddress", "isYin", "chainId", "deployTimestamp", "deployTxnBlockNumber", "owner", "collateralAsset", "marketParamsFeerate", "marketParamsAssertionliveness", "marketParamsBondcurrency", "marketParamsBondamount", "marketParamsClaimstatement", "marketParamsUniswappositionmanager", "marketParamsUniswapswaprouter", "marketParamsUniswapquoter", "marketParamsOptimisticoraclev3", "isCumulative", "question", "baseTokenName", "quoteTokenName", "collateralDecimals", "collateralSymbol", "initializationNonce", "factoryAddress", "minTradeSize", "event", "market", "category"],
  Resource_priceUpdateWithoutResourceInput: ["createdAt", "blockNumber", "timestamp", "value", "used", "feePaid"]
};

type InputTypesNames = keyof typeof inputTypes;

type InputTypeFieldNames<TInput extends InputTypesNames> = Exclude<
  keyof typeof inputTypes[TInput]["prototype"],
  number | symbol
>;

type InputTypeFieldsConfig<
  TInput extends InputTypesNames
> = FieldsConfig<InputTypeFieldNames<TInput>>;

export type InputTypeConfig<TInput extends InputTypesNames> = {
  class?: ClassDecorator[];
  fields?: InputTypeFieldsConfig<TInput>;
};

export type InputTypesEnhanceMap = {
  [TInput in InputTypesNames]?: InputTypeConfig<TInput>;
};

export function applyInputTypesEnhanceMap(
  inputTypesEnhanceMap: InputTypesEnhanceMap,
) {
  for (const inputTypeEnhanceMapKey of Object.keys(inputTypesEnhanceMap)) {
    const inputTypeName = inputTypeEnhanceMapKey as keyof typeof inputTypesEnhanceMap;
    const typeConfig = inputTypesEnhanceMap[inputTypeName]!;
    const typeClass = inputTypes[inputTypeName];
    const typeTarget = typeClass.prototype;
    applyTypeClassEnhanceConfig(
      typeConfig,
      typeClass,
      typeTarget,
      inputsInfo[inputTypeName as keyof typeof inputsInfo],
    );
  }
}

