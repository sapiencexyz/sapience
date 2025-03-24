import WeatherIndexer from '../src/resourcePriceFunctions/weatherIndexer';
import { Resource } from '../src/models/Resource';

// Mock resource for testing
const mockResource: Resource = {
  id: 1,
  slug: 'nyc-precipitation',
  name: 'NYC Precipitation',
  createdAt: new Date(),
  markets: [],
  resourcePrices: []
};

async function testWeatherIndexer() {
  try {
    console.log('Initializing Weather Indexer...');
    const indexer = new WeatherIndexer();

    // Test historical data for the last 24 hours
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - (24 * 60 * 60); // 24 hours ago

    console.log(`Fetching precipitation data from ${new Date(startTimestamp * 1000)} to ${new Date(endTimestamp * 1000)}`);
    
    const success = await indexer.indexBlockPriceFromTimestamp(
      mockResource,
      startTimestamp,
      endTimestamp
    );

    if (success) {
      console.log('Successfully fetched and stored precipitation data!');
    } else {
      console.error('Failed to fetch precipitation data');
    }

  } catch (error) {
    console.error('Error running weather indexer test:', error);
  }
}

// Run the test
testWeatherIndexer(); 