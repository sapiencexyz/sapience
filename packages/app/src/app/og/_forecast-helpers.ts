// Re-exports from shared data layer for backward compatibility with OG routes.
export {
  type ForecastCondition,
  type ForecastData,
  FORECAST_BY_UID_QUERY,
  d18ToPercentage,
  fetchForecastByUid,
} from '~/lib/data/forecasts';

export { getGraphQLEndpoint } from '~/lib/data/graphql';
