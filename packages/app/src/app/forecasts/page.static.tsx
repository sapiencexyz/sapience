import ForecastPageImp from '~/app/forecasts/ForecastPageImp';

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

const ForecastPage = () => {
  return <ForecastPageImp />;
};

export default ForecastPage;
