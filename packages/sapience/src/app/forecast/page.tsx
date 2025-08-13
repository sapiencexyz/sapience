import { QueryClient, dehydrate } from '@tanstack/react-query';
import { prefetchEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import ForecastPageImp from '~/app/forecast/ForecastPageImp';
import Hydrate from '~/components/Hydrate';
import { SCHEMA_UID } from '~/lib/constants/eas';
import { prefetchPredictions } from '~/hooks/graphql/usePredictions';

export function generateMetadata() {
  return {
    title: 'Forecast | Sapience',
    description: 'Forecast the probability of future events',
    openGraph: {
      title: 'Forecast | Sapience',
      description: 'Forecast the probability of future events',
      type: 'website',
    },
  };
}

const ForecastPage = async () => {
  // new query client for the server
  const serverQC = new QueryClient();

  // Prefetch enriched market groups data
  await prefetchEnrichedMarketGroups(serverQC);
  await prefetchPredictions(serverQC, SCHEMA_UID);

  const state = dehydrate(serverQC);
  return (
    <Hydrate state={state}>
      <ForecastPageImp />
    </Hydrate>
  );
};

export default ForecastPage;
