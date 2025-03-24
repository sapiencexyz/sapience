import { resourcePriceRepository } from '../db';
import Sentry from '../sentry';
import { IResourcePriceIndexer } from '../interfaces';
import { Resource } from 'src/models/Resource';
import axios from 'axios';

interface WeatherStation {
  properties: {
    stationIdentifier: string;
    name: string;
  };
}

interface WeatherObservation {
  properties: {
    timestamp: string;
    precipitationLastHour: {
      value: number | null;
    };
  };
}

class WeatherIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds
  private readonly latitude: number = 40.7306;
  private readonly longitude: number = -73.9352;
  private readonly userAgent: string = 'FoilWeatherIndexer/1.0 (contact@foil.so)';
  private stationId: string | null = null;

  constructor() {
    // Initialize the weather indexer for NYC coordinates
    this.initializeStation();
  }

  private async initializeStation() {
    try {
      // First get the points data
      const pointsResponse = await axios.get(
        `https://api.weather.gov/points/${this.latitude},${this.longitude}`,
        {
          headers: {
            'User-Agent': this.userAgent,
          },
        }
      );

      // Get the observation stations URL from the points response
      const stationsUrl = pointsResponse.data.properties.observationStations;
      const stationsResponse = await axios.get(stationsUrl, {
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      // Get the closest station (first in the list)
      if (stationsResponse.data.features && stationsResponse.data.features.length > 0) {
        const station = stationsResponse.data.features[0] as WeatherStation;
        this.stationId = station.properties.stationIdentifier;
        console.log(`[WeatherIndexer] Using station: ${station.properties.name} (${this.stationId})`);
      } else {
        throw new Error('No weather stations found near the specified coordinates');
      }
    } catch (error) {
      console.error('[WeatherIndexer] Error initializing station:', error);
      throw error;
    }
  }

  private async getHistoricalData(startTime: string, endTime?: string): Promise<WeatherObservation[]> {
    if (!this.stationId) {
      await this.initializeStation();
    }

    try {
      const url = `https://api.weather.gov/stations/${this.stationId}/observations`;
      const params: Record<string, string> = {
        start: startTime,
      };
      if (endTime) {
        params.end = endTime;
      }

      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
        params,
      });

      return response.data.features || [];
    } catch (error) {
      console.error('[WeatherIndexer] Error fetching historical data:', error);
      throw error;
    }
  }

  private async storeWeatherData(
    resource: Resource,
    timestamp: number,
    precipAmount: number | null
  ) {
    if (precipAmount === null) {
      console.warn(
        `[WeatherIndexer.${resource.slug}] No precipitation data for timestamp ${timestamp}. Skipping.`
      );
      return;
    }

    try {
      const price = {
        resource: { id: resource.id },
        timestamp,
        value: precipAmount.toString(),
        used: '0', // Not applicable for historical data
        feePaid: '0', // Not applicable for weather data
        blockNumber: 0, // Not applicable for weather data
      };
      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
      console.error(
        `[WeatherIndexer.${resource.slug}] Error storing weather data:`,
        error
      );
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      const startTime = new Date(timestamp * 1000).toISOString();
      const endTime = endTimestamp ? new Date(endTimestamp * 1000).toISOString() : undefined;

      const observations = await this.getHistoricalData(startTime, endTime);

      for (const observation of observations) {
        const observationTimestamp = new Date(observation.properties.timestamp).getTime() / 1000;
        await this.storeWeatherData(
          resource,
          observationTimestamp,
          observation.properties.precipitationLastHour?.value || 0
        );
      }
      return true;
    } catch (error) {
      console.error('[WeatherIndexer] Error indexing weather data:', error);
      return false;
    }
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log(
        `[WeatherIndexer.${resource.slug}] Already watching weather data for this resource`
      );
      return;
    }

    const startWatching = async () => {
      console.log(
        `[WeatherIndexer.${resource.slug}] Starting to watch weather data for NYC`
      );

      this.isWatching = true;

      const watchWeather = async () => {
        try {
          // Get the last hour's data
          const endTime = new Date().toISOString();
          const startTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
          
          const observations = await this.getHistoricalData(startTime, endTime);
          
          if (observations.length > 0) {
            const latestObservation = observations[0];
            const timestamp = new Date(latestObservation.properties.timestamp).getTime() / 1000;
            await this.storeWeatherData(
              resource,
              timestamp,
              latestObservation.properties.precipitationLastHour?.value || 0
            );
          }

          this.reconnectAttempts = 0;
          // Check every hour for new weather data
          setTimeout(watchWeather, 60 * 60 * 1000);
        } catch (error) {
          console.error(
            `[WeatherIndexer.${resource.slug}] Error in weather watcher:`,
            error
          );
          this.isWatching = false;

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
              `[WeatherIndexer.${resource.slug}] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
            );
            setTimeout(startWatching, this.reconnectDelay);
          } else {
            console.error(
              `[WeatherIndexer.${resource.slug}] Max reconnection attempts reached. Stopping watch.`
            );
            Sentry.captureMessage(
              'Max reconnection attempts reached for weather watcher'
            );
          }
        }
      };

      await watchWeather();
    };

    startWatching();
  }

  // This method is not applicable for weather data
  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    console.warn('[WeatherIndexer] indexBlocks is not applicable for weather data');
    return false;
  }
}

export default WeatherIndexer;
