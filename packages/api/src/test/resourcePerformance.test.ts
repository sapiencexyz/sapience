import { ResourcePerformance } from '../performance/resourcePerformance';
import { Resource } from '../models/Resource';
import { TIME_INTERVALS } from '../fixtures';
import dataSource from '../db';

async function testResourcePerformance() {
  // Initialize database connection
  await dataSource.initialize();

  try {
    // Get a resource to test with
    const resource = await dataSource.getRepository(Resource).findOne({
      where: { slug: 'eth' }, // Replace with a resource slug you want to test
    });

    if (!resource) {
      console.error('Resource not found');
      return;
    }

    // Create ResourcePerformance instance
    const resourcePerformance = new ResourcePerformance(resource, [
      TIME_INTERVALS.intervals.INTERVAL_1_MINUTE,
      TIME_INTERVALS.intervals.INTERVAL_5_MINUTES,
      TIME_INTERVALS.intervals.INTERVAL_15_MINUTES,
      TIME_INTERVALS.intervals.INTERVAL_30_MINUTES,
      TIME_INTERVALS.intervals.INTERVAL_4_HOURS,
      TIME_INTERVALS.intervals.INTERVAL_1_DAY,
      TIME_INTERVALS.intervals.INTERVAL_7_DAYS,
      TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
    ]);

    // Get the last processed timestamp
    const lastProcessedTimestamp = 0; // Start from beginning, or use a specific timestamp

    console.log('Starting resource performance processing...');
    console.log(`Resource: ${resource.slug}`);
    console.log(`Starting from timestamp: ${lastProcessedTimestamp}`);

    // Process the data
    await resourcePerformance.processResourceData(lastProcessedTimestamp);

    console.log('Resource performance processing completed');
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // Close the database connection
    await dataSource.destroy();
  }
}

// Run the test
testResourcePerformance().catch(console.error); 