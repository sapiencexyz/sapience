import ForecastPageContent from '~/app/forecasts/ForecastPageContent';

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
  return <ForecastPageContent />;
};

export default ForecastPage;
