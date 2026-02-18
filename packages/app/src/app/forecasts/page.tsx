import { QueryClient, dehydrate } from '@tanstack/react-query';
import ForecastPageImp from '~/app/forecasts/ForecastPageImp';
import Hydrate from '~/components/Hydrate';
import { SCHEMA_UID } from '~/lib/constants';
import { prefetchForecasts } from '~/hooks/graphql/useForecasts';

export function generateMetadata() {
  return {
    title: 'Forecast',
    description: 'Forecast the probability of future events',
    openGraph: {
      title: 'Forecast',
      description: 'Forecast the probability of future events',
      type: 'website',
    },
  };
}

const ForecastPage = async () => {
  // new query client for the server
  const serverQC = new QueryClient();

  await prefetchForecasts(serverQC, SCHEMA_UID);

  const state = dehydrate(serverQC);
  return (
    <Hydrate state={state}>
      <ForecastPageImp />
    </Hydrate>
  );
};

export default ForecastPage;
