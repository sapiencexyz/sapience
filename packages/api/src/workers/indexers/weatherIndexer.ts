import dotenv from 'dotenv';
import { IResourcePriceIndexer } from '../../interfaces';
import prisma from '../../db';
import WeatherService from './weatherService';
import Sentry from '../../instrument';

dotenv.config();

interface Resource {
  id: number;
  slug: string;
}

interface WeatherRecord {
  timestamp: string;
  temperature?: number;
  temperatureF?: number;
  precipitation?: number;
  precipitationInches?: number;
  stationName: string;
}

interface WeatherSummary {
  timestamp: string;
  nycStation: string;
  laStation: string;
  temperature: {
    location: string;
    records: WeatherRecord[];
    latest: WeatherRecord | null;
  };
  precipitation: {
    location: string;
    records: WeatherRecord[];
    latest: WeatherRecord | null;
    cumulative: {
      millimeters: number;
      inches: number;
    };
  };
}

const sharedWeatherService = new WeatherService();

export class WeatherIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private readonly POLL_DELAY = 30 * 60 * 1000; // 30 minutes
  private readonly resourceType: 'temperature' | 'precipitation';
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(resourceType: 'temperature' | 'precipitation') {
    this.resourceType = resourceType;
    console.log(`[WeatherIndexer] Initialized for ${resourceType}`);
  }

  private async storeWeatherPrice(
    resource: Resource,
    weatherData: WeatherSummary
  ) {
    try {
      console.log(
        `[WeatherIndexer.${this.resourceType}] Starting storeWeatherPrice for resource:`,
        {
          id: resource.id,
          slug: resource.slug,
          type: this.resourceType,
        }
      );

      if (
        this.resourceType === 'temperature' &&
        weatherData.temperature.latest?.temperature !== undefined
      ) {
        const temperatureValue = (
          Number(weatherData.temperature.latest.temperature.toFixed(2)) *
          10 ** 9
        ).toString();
        const price = {
          resource: { id: resource.id },
          timestamp: Math.floor(
            new Date(weatherData.temperature.latest.timestamp).getTime() / 1000
          ),
          value: temperatureValue,
          used: '1',
          feePaid: temperatureValue,
          blockNumber: 0,
        };
        console.log(
          `[WeatherIndexer.${this.resourceType}] Temperature value type:`,
          typeof temperatureValue
        );
        console.log(
          `[WeatherIndexer.${this.resourceType}] Raw temperature value:`,
          weatherData.temperature.latest.temperature
        );
        console.log(
          `[WeatherIndexer.${this.resourceType}] Formatted temperature value:`,
          temperatureValue
        );

        try {
          await prisma.resource_price.upsert({
            where: {
              resourceId_timestamp: {
                resourceId: resource.id,
                timestamp: Math.floor(
                  new Date(weatherData.temperature.latest.timestamp).getTime() / 1000
                ),
              },
            },
            create: {
              resourceId: resource.id,
              timestamp: Math.floor(
                new Date(weatherData.temperature.latest.timestamp).getTime() / 1000
              ),
              value: temperatureValue,
              used: '1',
              feePaid: temperatureValue,
              blockNumber: 0,
            },
            update: {
              value: temperatureValue,
              used: '1',
              feePaid: temperatureValue,
              blockNumber: 0,
            },
          });
          console.log(
            `[WeatherIndexer.${this.resourceType}] Upserted temperature data in the database for ${price.timestamp}`
          );
          // const result = await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
          // console.log(`[WeatherIndexer.${this.resourceType}] Database upsert result:`, result);
        } catch (dbError) {
          console.error(
            `[WeatherIndexer.${this.resourceType}] Database error during upsert:`,
            {
              error: dbError,
              price: price,
              resource: resource.slug,
            }
          );
          throw dbError;
        }
      } else if (
        this.resourceType === 'precipitation' &&
        weatherData.precipitation.latest?.precipitation !== undefined
      ) {
        const price = {
          resource: { id: resource.id },
          timestamp: Math.floor(
            new Date(weatherData.precipitation.latest.timestamp).getTime() /
              1000
          ),
          value: (
            weatherData.precipitation.latest.precipitation *
            10 ** 9
          ).toString(),
          used: '1',
          feePaid: (
            weatherData.precipitation.latest.precipitation *
            10 ** 9
          ).toString(),
          blockNumber: 0,
        };
        // console.log(`[WeatherIndexer.${this.resourceType}] Prepared precipitation price data:`, price);

        try {
          await prisma.resource_price.upsert({
            where: {
              resourceId_timestamp: {
                resourceId: resource.id,
                timestamp: Math.floor(
                  new Date(weatherData.precipitation.latest.timestamp).getTime() / 1000
                ),
              },
            },
            create: {
              resourceId: resource.id,
              timestamp: Math.floor(
                new Date(weatherData.precipitation.latest.timestamp).getTime() / 1000
              ),
              value: (
                weatherData.precipitation.latest.precipitation *
                10 ** 9
              ).toString(),
              used: '1',
              feePaid: (
                weatherData.precipitation.latest.precipitation *
                10 ** 9
              ).toString(),
              blockNumber: 0,
            },
            update: {
              value: (
                weatherData.precipitation.latest.precipitation *
                10 ** 9
              ).toString(),
              used: '1',
              feePaid: (
                weatherData.precipitation.latest.precipitation *
                10 ** 9
              ).toString(),
              blockNumber: 0,
            },
          });
          console.log(
            `[WeatherIndexer.${this.resourceType}] Upserted precipitation data in the database for ${price.timestamp}`
          );
          // const result = await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
          // console.log(`[WeatherIndexer.${this.resourceType}] Database upsert result:`, result);
        } catch (dbError) {
          console.error(
            `[WeatherIndexer.${this.resourceType}] Database error during upsert:`,
            {
              error: dbError,
              price: price,
              resource: resource.slug,
            }
          );
          throw dbError;
        }
      } else {
        console.log(
          `[WeatherIndexer.${this.resourceType}] No valid data to store:`,
          {
            resourceType: this.resourceType,
            temperatureData: weatherData.temperature.latest,
            precipitationData: weatherData.precipitation.latest,
          }
        );
      }
    } catch (error) {
      console.error(
        `[WeatherIndexer.${this.resourceType}] Error in storeWeatherPrice:`,
        {
          error: error,
          resource: resource.slug,
          type: this.resourceType,
        }
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('resource', resource.slug);
        scope.setExtra('type', this.resourceType);
        scope.setExtra('weatherData', JSON.stringify(weatherData));
        Sentry.captureException(error);
      });
      throw error;
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    try {
      const weatherData: WeatherSummary[] =
        await sharedWeatherService.getHistoricalData(
          startTimestamp,
          endTimestamp
        );

      for (const reading of weatherData) {
        console.log(reading);
        const maybeReading = await prisma.resource_price.findFirst({
          where: {
            resourceId: resource.id,
            timestamp: Math.floor(new Date(reading.timestamp).getTime() / 1000),
          },
        });

        if (!overwriteExisting && maybeReading) {
          console.log(
            'Skipping reading for timestamp',
            reading.timestamp,
            'as it already exists'
          );
          continue;
        }

        await this.storeWeatherPrice(resource, reading);
      }

      return true;
    } catch (error) {
      console.error(
        `[WeatherIndexer.${this.resourceType}] Error indexing historical data:`,
        error
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('resource', resource.slug);
        scope.setExtra('type', this.resourceType);
        scope.setExtra('startTimestamp', startTimestamp);
        scope.setExtra('endTimestamp', endTimestamp);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[WeatherIndexer.${this.resourceType}] Starting indexBlocks for resource ${resource.slug}`
      );
      const weatherData = await sharedWeatherService.getLatestData();
      console.log(
        `[WeatherIndexer.${this.resourceType}] Got latest weather data in indexBlocks`
      );
      console.log(
        `[WeatherIndexer.${this.resourceType}] Weather data structure:`,
        {
          hasTemperature: !!weatherData.temperature.latest,
          hasPrecipitation: !!weatherData.precipitation.latest,
          temperature: weatherData.temperature.latest,
          precipitation: weatherData.precipitation.latest,
        }
      );

      // Create a new WeatherSummary with the latest data
      const latestData: WeatherSummary = {
        timestamp: new Date().toISOString(),
        nycStation: weatherData.nycStation,
        laStation: weatherData.laStation,
        temperature: {
          location: weatherData.temperature.location,
          records: weatherData.temperature.records,
          latest: weatherData.temperature.latest,
        },
        precipitation: {
          location: weatherData.precipitation.location,
          records: weatherData.precipitation.records,
          latest: weatherData.precipitation.latest,
          cumulative: weatherData.precipitation.cumulative,
        },
      };

      await this.storeWeatherPrice(resource, latestData);
      console.log(
        `[WeatherIndexer.${this.resourceType}] Successfully completed indexBlocks`
      );
      return true;
    } catch (error) {
      console.error(
        `[WeatherIndexer.${this.resourceType}] Error indexing blocks:`,
        error
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('resource', resource.slug);
        scope.setExtra('type', this.resourceType);
        scope.setExtra('blocks', blocks);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async watchBlocksForResource(resource: Resource): Promise<void> {
    if (!process.env.NOAA_TOKEN) {
      console.log(
        'SF API token not found; skip intializing the watch procedure for weather indexers...'
      );
      return;
    }

    sharedWeatherService.start().catch((error) => {
      console.error('Failed to start weather service:', error);
      process.exit(1);
    });

    console.log(
      `[WeatherIndexer.${this.resourceType}] Starting to watch blocks for resource ${resource.slug}`
    );
    console.log(`[WeatherIndexer.${this.resourceType}] Resource details:`, {
      id: resource.id,
      slug: resource.slug,
      type: this.resourceType,
    });

    if (this.isWatching) {
      console.log(
        `[WeatherIndexer.${this.resourceType}] Already watching weather for this resource`
      );
      return;
    }

    try {
      console.log(
        `[WeatherIndexer.${this.resourceType}] 1. Starting weather service`
      );
      await sharedWeatherService.start();
      console.log(
        `[WeatherIndexer.${this.resourceType}] 2. Weather service started successfully`
      );

      try {
        console.log(
          `[WeatherIndexer.${this.resourceType}] 3. Polling for new weather data`
        );
        const weatherData = await sharedWeatherService.getLatestData();

        // Log before database operation
        console.log(
          `[WeatherIndexer.${this.resourceType}] 4. Attempting database upsert for resource:`,
          {
            resourceId: resource.id,
            resourceSlug: resource.slug,
            timestamp: new Date().toISOString(),
          }
        );

        await this.storeWeatherPrice(resource, weatherData);

        // Log after successful database operation
        console.log(
          `[WeatherIndexer.${this.resourceType}] 5. Successfully stored weather data in database`
        );
      } catch (error) {
        console.error(
          `[WeatherIndexer.${this.resourceType}] Error in weather polling:`,
          error
        );
        if (error instanceof Error) {
          console.error(
            `[WeatherIndexer.${this.resourceType}] Error details:`,
            {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          );
        }
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setExtra('resource', resource.slug);
          scope.setExtra('type', this.resourceType);
          Sentry.captureException(error);
        });
      }

      this.pollInterval = setInterval(async () => {
        try {
          console.log(
            `[WeatherIndexer.${this.resourceType}] 3. Polling for new weather data`
          );
          const weatherData = await sharedWeatherService.getLatestData();
          // console.log(`[WeatherIndexer.${this.resourceType}] 6. Received new weather data:`, {
          //     timestamp: weatherData.timestamp,
          //     hasTemperature: !!weatherData.temperature.latest,
          //     hasPrecipitation: !!weatherData.precipitation.latest
          // });

          // Log before database operation
          console.log(
            `[WeatherIndexer.${this.resourceType}] 4. Attempting database upsert for resource:`,
            {
              resourceId: resource.id,
              resourceSlug: resource.slug,
              timestamp: new Date().toISOString(),
            }
          );

          await this.storeWeatherPrice(resource, weatherData);

          // Log after successful database operation
          console.log(
            `[WeatherIndexer.${this.resourceType}] 5. Successfully stored weather data in database`
          );
        } catch (error) {
          console.error(
            `[WeatherIndexer.${this.resourceType}] Error in weather polling:`,
            error
          );
          if (error instanceof Error) {
            console.error(
              `[WeatherIndexer.${this.resourceType}] Error details:`,
              {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            );
          }
          Sentry.withScope((scope: Sentry.Scope) => {
            scope.setExtra('resource', resource.slug);
            scope.setExtra('type', this.resourceType);
            Sentry.captureException(error);
          });
        }
      }, this.POLL_DELAY);

      this.isWatching = true;
      console.log(
        `[WeatherIndexer.${this.resourceType}] Successfully started watching blocks`
      );
    } catch (error) {
      this.handleApiError(error, 'WeatherWatcher');
      throw error;
    }
  }

  private handleApiError(error: unknown, context: string): void {
    const resourceSlug = 'weather-' + this.resourceType;
    console.error(`[WeatherIndexer.${this.resourceType}] ${context}:`, error);

    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('context', context);
      scope.setExtra('resource', resourceSlug);
      Sentry.captureException(error);
    });
  }
}
