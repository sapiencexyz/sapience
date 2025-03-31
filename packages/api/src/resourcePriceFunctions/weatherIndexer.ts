import dotenv from 'dotenv';
import { IResourcePriceIndexer } from '../interfaces';
import { resourcePriceRepository } from '../db';
import { Resource } from '../models/Resource';
import WeatherService from './weatherService';
import Sentry from '../sentry';

dotenv.config();

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

// Create a single shared weather service instance
const sharedWeatherService = new WeatherService();

class WeatherIndexer implements IResourcePriceIndexer {
    private isWatching: boolean = false;
    private readonly POLL_DELAY = 30 * 60 * 1000; // 30 minutes
    private readonly resourceType: 'temperature' | 'precipitation';

    constructor(resourceType: 'temperature' | 'precipitation') {
        this.resourceType = resourceType;
        console.log(`[WeatherIndexer] Initialized for ${resourceType}`);
    }

    private async storeWeatherPrice(resource: Resource, weatherData: WeatherSummary) {
        try {
            console.log(`[WeatherIndexer.${this.resourceType}] Starting storeWeatherPrice for resource:`, {
                id: resource.id,
                slug: resource.slug,
                type: this.resourceType
            });

            if (this.resourceType === 'temperature' && weatherData.temperature.latest?.temperature !== undefined) {
                const temperatureValue = weatherData.temperature.latest.temperature.toFixed(2);
                const price = {
                    resource: { id: resource.id },
                    timestamp: Math.floor(new Date(weatherData.temperature.latest.timestamp).getTime() / 1000),
                    value: temperatureValue,
                    used: "1",
                    feePaid: "1",
                    blockNumber: 0,
                };
                console.log(`[WeatherIndexer.${this.resourceType}] Temperature value type:`, typeof temperatureValue);
                console.log(`[WeatherIndexer.${this.resourceType}] Raw temperature value:`, weatherData.temperature.latest.temperature);
                console.log(`[WeatherIndexer.${this.resourceType}] Formatted temperature value:`, temperatureValue);
                
                try {
                    const result = await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
                    console.log(`[WeatherIndexer.${this.resourceType}] Database upsert result:`, result);
                } catch (dbError) {
                    console.error(`[WeatherIndexer.${this.resourceType}] Database error during upsert:`, {
                        error: dbError,
                        price: price,
                        resource: resource.slug
                    });
                    throw dbError;
                }
            } else if (this.resourceType === 'precipitation' && weatherData.precipitation.latest?.precipitation !== undefined) {
                const price = {
                    resource: { id: resource.id },
                    timestamp: Math.floor(new Date(weatherData.precipitation.latest.timestamp).getTime() / 1000),
                    value: weatherData.precipitation.latest.precipitation.toString(),
                    used: "1",
                    feePaid: "1",
                    blockNumber: 0,
                };
                console.log(`[WeatherIndexer.${this.resourceType}] Prepared precipitation price data:`, price);
                
                try {
                    const result = await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
                    console.log(`[WeatherIndexer.${this.resourceType}] Database upsert result:`, result);
                } catch (dbError) {
                    console.error(`[WeatherIndexer.${this.resourceType}] Database error during upsert:`, {
                        error: dbError,
                        price: price,
                        resource: resource.slug
                    });
                    throw dbError;
                }
            } else {
                console.log(`[WeatherIndexer.${this.resourceType}] No valid data to store:`, {
                    resourceType: this.resourceType,
                    temperatureData: weatherData.temperature.latest,
                    precipitationData: weatherData.precipitation.latest
                });
            }
        } catch (error) {
            console.error(`[WeatherIndexer.${this.resourceType}] Error in storeWeatherPrice:`, {
                error: error,
                resource: resource.slug,
                type: this.resourceType
            });
            Sentry.withScope((scope) => {
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
        endTimestamp?: number
    ): Promise<boolean> {
        try {
            const weatherData = await sharedWeatherService.getHistoricalData(
                startTimestamp,
                endTimestamp
            );

            for (const reading of weatherData) {
                await this.storeWeatherPrice(resource, reading);
            }

            return true;
        } catch (error) {
            console.error(`[WeatherIndexer.${this.resourceType}] Error indexing historical data:`, error);
            Sentry.withScope((scope) => {
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
            console.log(`[WeatherIndexer.${this.resourceType}] Starting indexBlocks for resource ${resource.slug}`);
            const weatherData = await sharedWeatherService.getLatestData();
            console.log(`[WeatherIndexer.${this.resourceType}] Got latest weather data in indexBlocks`);
            console.log(`[WeatherIndexer.${this.resourceType}] Weather data structure:`, {
                hasTemperature: !!weatherData.temperature.latest,
                hasPrecipitation: !!weatherData.precipitation.latest,
                temperature: weatherData.temperature.latest,
                precipitation: weatherData.precipitation.latest
            });

            // Create a new WeatherSummary with the latest data
            const latestData: WeatherSummary = {
                timestamp: new Date().toISOString(),
                nycStation: weatherData.nycStation,
                laStation: weatherData.laStation,
                temperature: {
                    location: weatherData.temperature.location,
                    records: weatherData.temperature.records,
                    latest: weatherData.temperature.latest
                },
                precipitation: {
                    location: weatherData.precipitation.location,
                    records: weatherData.precipitation.records,
                    latest: weatherData.precipitation.latest,
                    cumulative: weatherData.precipitation.cumulative
                }
            };

            await this.storeWeatherPrice(resource, latestData);
            console.log(`[WeatherIndexer.${this.resourceType}] Successfully completed indexBlocks`);
            return true;
        } catch (error) {
            console.error(`[WeatherIndexer.${this.resourceType}] Error indexing blocks:`, error);
            Sentry.withScope((scope) => {
                scope.setExtra('resource', resource.slug);
                scope.setExtra('type', this.resourceType);
                scope.setExtra('blocks', blocks);
                Sentry.captureException(error);
            });
            return false;
        }
    }

    async watchBlocksForResource(resource: Resource): Promise<void> {
        console.log(`[WeatherIndexer.${this.resourceType}] Starting to watch blocks for resource ${resource.slug}`);
        console.log(`[WeatherIndexer.${this.resourceType}] Resource details:`, {
            id: resource.id,
            slug: resource.slug,
            type: this.resourceType
        });
        
        if (this.isWatching) {
            console.log(`[WeatherIndexer.${this.resourceType}] Already watching weather for this resource`);
            return;
        }

        try {
            console.log(`[WeatherIndexer.${this.resourceType}] Starting weather service`);
            await sharedWeatherService.start();
            console.log(`[WeatherIndexer.${this.resourceType}] Weather service started successfully`);

            // Log initial data fetch
            console.log(`[WeatherIndexer.${this.resourceType}] Fetching initial weather data`);
            const initialData = await sharedWeatherService.getLatestData();
            console.log(`[WeatherIndexer.${this.resourceType}] Initial weather data:`, {
                hasTemperature: !!initialData.temperature.latest,
                hasPrecipitation: !!initialData.precipitation.latest,
                temperature: initialData.temperature.latest,
                precipitation: initialData.precipitation.latest
            });

            this.pollInterval = setInterval(async () => {
                try {
                    console.log(`[WeatherIndexer.${this.resourceType}] Polling for new weather data`);
                    const weatherData = await sharedWeatherService.getLatestData();
                    console.log(`[WeatherIndexer.${this.resourceType}] Received new weather data:`, {
                        timestamp: weatherData.timestamp,
                        hasTemperature: !!weatherData.temperature.latest,
                        hasPrecipitation: !!weatherData.precipitation.latest
                    });
                    
                    // Log before database operation
                    console.log(`[WeatherIndexer.${this.resourceType}] Attempting database upsert for resource:`, {
                        resourceId: resource.id,
                        resourceSlug: resource.slug,
                        timestamp: new Date().toISOString()
                    });
                    
                    await this.storeWeatherPrice(resource, weatherData);
                    
                    // Log after successful database operation
                    console.log(`[WeatherIndexer.${this.resourceType}] Successfully stored weather data in database`);
                } catch (error) {
                    console.error(`[WeatherIndexer.${this.resourceType}] Error in weather polling:`, error);
                    console.error(`[WeatherIndexer.${this.resourceType}] Error details:`, {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    });
                    Sentry.withScope((scope) => {
                        scope.setExtra('resource', resource.slug);
                        scope.setExtra('type', this.resourceType);
                        Sentry.captureException(error);
                    });
                }
            }, this.POLL_DELAY);

            this.isWatching = true;
            console.log(`[WeatherIndexer.${this.resourceType}] Successfully started watching blocks`);
        } catch (error) {
            console.error(`[WeatherIndexer.${this.resourceType}] Failed to start watching blocks:`, error);
            throw error;
        }
    }
}

// Create separate indexers for temperature and precipitation
export const temperatureIndexer = new WeatherIndexer('temperature');
export const precipitationIndexer = new WeatherIndexer('precipitation');

// Start the shared weather service
sharedWeatherService.start().catch(error => {
    console.error('Failed to start weather service:', error);
    process.exit(1);
}); 