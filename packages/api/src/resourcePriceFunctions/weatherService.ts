import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { sleep } from 'src/utils';

dotenv.config();

// Configuration
const CONFIG = {
  NYC: {
    LAT: 40.7128,
    LON: -74.006,
    NAME: 'New York City',
    API: {
      BASE_URL: 'https://api.weather.gov',
      HEADERS: {
        'User-Agent': '(weather_service, contact@example.com)',
        Accept: 'application/geo+json',
      },
    },
  },
  SF: {
    STATION_ID: 'USW00023272',
    NAME: 'SAN FRANCISCO DWTN',
    API: {
      BASE_URL: 'https://www.ncdc.noaa.gov/cdo-web/api/v2',
      TOKEN: process.env.NOAA_TOKEN,
    },
  },
  UPDATE_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  LOOKBACK_DAYS: 12,
  DATA_DIR: 'data',
} as const;

// Type definitions
interface WeatherRecord {
  timestamp: string;
  temperature?: number;
  temperatureF?: number;
  precipitation?: number;
  precipitationInches?: number;
  stationName: string;
}

interface WeatherData {
  temperature: WeatherRecord[];
  precipitation: WeatherRecord[];
}

interface NOAAResponse {
  results: Array<{
    date: string;
    value: number;
  }>;
}

interface NWSStation {
  properties: {
    stationIdentifier: string;
    name: string;
  };
}

interface NWSObservation {
  timestamp: string;
  temperature: {
    value: number | null;
  };
}

interface NWSResponse {
  features: Array<{
    properties: NWSObservation;
  }>;
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

export default class WeatherService {
  private nycStation: string = '';
  private cumulativePrecipitation: number = 0;
  private isRunning: boolean = false;
  private latestData: WeatherSummary | null = null;

  constructor() {
    this.validateConfig();
  }

  /**
   * Starts the weather service, performing initial update and scheduling regular updates
   * Uses side effects (writing to class variable) to perform the update
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('\n=== Weather Service Already Running ===\n');
      return;
    }

    console.log('\n=== Starting Weather Service ===');
    console.log(
      `Update Interval: ${CONFIG.UPDATE_INTERVAL_MS / 60000} minutes`
    );
    console.log(`History: ${CONFIG.LOOKBACK_DAYS} days`);
    console.log('Monitoring:');
    console.log(`- ${CONFIG.NYC.NAME} Temperature (NWS API)`);
    console.log(`- ${CONFIG.SF.NAME} Precipitation (NOAA API)\n`);

    await this.checkForUpdates();

    setInterval(async () => {
      console.log('\n=== Scheduled Update ===', new Date().toISOString());
      try {
        await this.checkForUpdates();
      } catch (error) {
        console.error('Scheduled update failed:', error);
      }
    }, CONFIG.UPDATE_INTERVAL_MS);

    this.isRunning = true;
  }

  /**
   * Gets the latest weather data
   */
  public async getLatestData(): Promise<WeatherSummary> {
    await this.checkForUpdates();
    return this.latestData || this.getCurrentSummaryPlaceholder();
  }

  /**
   * Gets historical weather data for a specific time range
   */
  public async getHistoricalData(
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<WeatherSummary[]> {
    const { startDate, endDate } = this.getDateRange(
      startTimestamp,
      endTimestamp
    );

    let result: WeatherSummary[] | null = null;
    while (true) {
      try {
        const [tempRecords, precipRecords] = await Promise.all([
          this.fetchNYCTemperature(startDate, endDate),
          this.fetchLAPrecipitation(startDate, endDate),
        ]);
        result = this.processHistoricalData(tempRecords, precipRecords);
        break;
      } catch (err) {
        console.log(
          `Error ${err} has been caught, sleeping for 3s trying to refetch the data...`
        );
        sleep(3000);
        continue;
      }
    }

    return result;
  }

  /**
   * Fetches precipitation data from NOAA API for Los Angeles
   * This specific API has a broken start/end date filters
   * After querying for April 2 as the latest date, we get March 28 as the latest data point.
   */
  private async fetchLAPrecipitation(
    startDate: Date,
    endDate: Date
  ): Promise<WeatherRecord[]> {
    try {
      const url = `${CONFIG.SF.API.BASE_URL}/data`;

      // The API is definitely bugged and doesn't return all of the desired data.
      // The end date is shifted by 3 days backwards, hence we would need to settle 4 days later
      const params = {
        datasetid: 'GHCND',
        stationid: `GHCND:${CONFIG.SF.STATION_ID}`,
        startdate: startDate.toISOString().split('T')[0],
        enddate: endDate.toISOString().split('T')[0],
        limit: 1000,
        datatypeid: 'PRCP',
        units: 'metric',
      };

      const response = await axios.get<NOAAResponse>(url, {
        params,
        headers: { token: CONFIG.SF.API.TOKEN },
      });

      if (!response.data?.results) {
        throw new Error('Invalid NOAA API response format');
      }

      let totalPrecip = 0;
      const records = response.data.results
        .filter((result) => typeof result.value === 'number')
        .map((result) => {
          const precipMM = result.value;
          totalPrecip += precipMM;
          return {
            timestamp: new Date(result.date).toISOString(),
            precipitation: precipMM,
            precipitationInches: Number(
              this.convertMillimetersToInches(precipMM).toFixed(2)
            ),
            stationName: CONFIG.SF.NAME,
          };
        });

      console.log(`Retrieved ${records.length} precipitation records`);
      console.log(
        `Total: ${totalPrecip.toFixed(1)}mm (${this.convertMillimetersToInches(totalPrecip).toFixed(2)}in)`
      );

      // for (let record of records) {
      //     console.log(record);
      // }

      // assert(records.length === CONFIG.LOOKBACK_DAYS - 4, "Unexpected number of records present!");

      return records;
    } catch (error) {
      this.handleApiError(error, 'SF precipitation');
      throw error;
    }
  }

  /**
   * Fetches temperature data from NWS API for New York City
   * This specific API doesn't store historical data it seems; can only go as far as a week(?)
   */
  private async fetchNYCTemperature(
    startDate: Date,
    endDate: Date
  ): Promise<WeatherRecord[]> {
    try {
      // Get the nearest weather station
      const pointsUrl = `${CONFIG.NYC.API.BASE_URL}/points/${CONFIG.NYC.LAT},${CONFIG.NYC.LON}`;
      const pointsResponse = await axios.get(pointsUrl, {
        headers: CONFIG.NYC.API.HEADERS,
      });

      const stationsUrl = pointsResponse.data.properties.observationStations;
      const stationsResponse = await axios.get<{ features: NWSStation[] }>(
        stationsUrl,
        {
          headers: CONFIG.NYC.API.HEADERS,
        }
      );

      const station = stationsResponse.data.features[0].properties;
      this.nycStation = station.name;

      // Fetch observations
      const observationsUrl = `${CONFIG.NYC.API.BASE_URL}/stations/${station.stationIdentifier}/observations`;

      // console.log("DATES:", startDate.toISOString(), endDate.toISOString())
      const observationsResponse = await axios.get<NWSResponse>(
        observationsUrl,
        {
          headers: CONFIG.NYC.API.HEADERS,
          params: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
        }
      );

      const records = observationsResponse.data.features
        .map((feature) => feature.properties)
        .filter((obs: NWSObservation) => obs.temperature?.value !== null)
        .map((obs: NWSObservation) => ({
          timestamp: new Date(obs.timestamp).toISOString(),
          temperature: Number(obs.temperature.value!.toFixed(1)),
          temperatureF: Number(
            this.convertCelsiusToFahrenheit(obs.temperature.value!).toFixed(1)
          ),
          stationName: station.name,
        }));

      console.log(`Retrieved ${records.length} temperature records`);

      return records;
    } catch (error) {
      this.handleApiError(error, 'NYC temperature');
      throw error;
    }
  }

  /**
   * Performs a weather update cycle, fetching and saving new data
   */
  private async checkForUpdates(): Promise<void> {
    try {
      console.log('\n=== Fetching Weather Updates ===');

      const [tempRecords, precipRecords] = await Promise.all([
        this.fetchNYCTemperature(
          new Date(Date.now() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
          new Date()
        ),
        this.fetchLAPrecipitation(
          new Date(Date.now() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
          new Date()
        ),
      ]);

      this.cumulativePrecipitation = precipRecords.reduce(
        (sum, record) => sum + (record.precipitation || 0),
        0
      );

      this.latestData = {
        timestamp: new Date().toISOString(),
        nycStation: this.nycStation,
        laStation: CONFIG.SF.NAME,
        temperature: {
          location: CONFIG.NYC.NAME,
          records: tempRecords,
          latest: tempRecords[0] || null,
        },
        precipitation: {
          location: CONFIG.SF.NAME,
          records: precipRecords,
          latest: precipRecords[precipRecords.length - 1] || null,
          cumulative: {
            millimeters: Number(this.cumulativePrecipitation.toFixed(1)),
            inches: Number(
              this.convertMillimetersToInches(
                this.cumulativePrecipitation
              ).toFixed(2)
            ),
          },
        },
      };

      // this.logLatestReadings(this.latestData);
      console.log('\n=== Weather Update Complete ===\n');
    } catch (error) {
      this.handleApiError(error, 'Refetch Check');
      throw error;
    }
  }

  /**
   * Saves weather data to a JSON file
   */
  private async saveData(data: WeatherData): Promise<void> {
    await this.ensureDataDirectory();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filepath = path.join(
      CONFIG.DATA_DIR,
      `weather_data_${timestamp}.json`
    );

    this.cumulativePrecipitation = data.precipitation.reduce(
      (sum, record) => sum + (record.precipitation || 0),
      0
    );

    const summary: WeatherSummary = {
      timestamp: new Date().toISOString(),
      nycStation: this.nycStation,
      laStation: CONFIG.SF.NAME,
      temperature: {
        location: CONFIG.NYC.NAME,
        records: data.temperature,
        latest: data.temperature[data.temperature.length - 1] || null,
      },
      precipitation: {
        location: CONFIG.SF.NAME,
        records: data.precipitation,
        latest: data.precipitation[data.precipitation.length - 1] || null,
        cumulative: {
          millimeters: Number(this.cumulativePrecipitation.toFixed(1)),
          inches: Number(
            this.convertMillimetersToInches(
              this.cumulativePrecipitation
            ).toFixed(2)
          ),
        },
      },
    };

    try {
      await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
      this.logLatestReadings(summary);
    } catch (error) {
      console.error('Failed to save weather data:', error);
      this.handleApiError(error, 'SaveData');
      throw error;
    }
  }

  /**
   * Gets the current weather summary
   */
  private getCurrentSummaryPlaceholder(): WeatherSummary {
    return {
      timestamp: new Date().toISOString(),
      nycStation: this.nycStation,
      laStation: CONFIG.SF.NAME,
      temperature: {
        location: CONFIG.NYC.NAME,
        records: [],
        latest: null,
      },
      precipitation: {
        location: CONFIG.SF.NAME,
        records: [],
        latest: null,
        cumulative: {
          millimeters: 0,
          inches: 0,
        },
      },
    };
  }

  /**
   * Processes historical data into summaries
   */
  private processHistoricalData(
    tempRecords: WeatherRecord[],
    precipRecords: WeatherRecord[]
  ): WeatherSummary[] {
    const summaries: WeatherSummary[] = [];
    const tempMap = new Map(tempRecords.map((r) => [r.timestamp, r]));
    const precipMap = new Map(precipRecords.map((r) => [r.timestamp, r]));

    // Combine timestamps and sort
    const allTimestamps = [
      ...new Set([...tempMap.keys(), ...precipMap.keys()]),
    ].sort();

    for (const timestamp of allTimestamps) {
      const tempRecord = tempMap.get(timestamp);
      const precipRecord = precipMap.get(timestamp);

      summaries.push({
        timestamp,
        nycStation: this.nycStation,
        laStation: CONFIG.SF.NAME,
        temperature: {
          location: CONFIG.NYC.NAME,
          records: tempRecord ? [tempRecord] : [],
          latest: tempRecord || null,
        },
        precipitation: {
          location: CONFIG.SF.NAME,
          records: precipRecord ? [precipRecord] : [],
          latest: precipRecord || null,
          cumulative: {
            millimeters: precipRecord?.precipitation || 0,
            inches: precipRecord?.precipitationInches || 0,
          },
        },
      });
    }

    return summaries;
  }

  // Utility methods
  private validateConfig(): void {
    if (!CONFIG.SF.API.TOKEN) {
      throw new Error('NOAA API token not found in environment variables');
    }
  }

  private getDateRange(
    startTimestamp: number,
    endTimestamp?: number
  ): { startDate: Date; endDate: Date } {
    const endDate = endTimestamp ? new Date(endTimestamp * 1000) : new Date();
    const startDate = new Date(startTimestamp * 1000);
    return { startDate, endDate };
  }

  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
  }

  private convertCelsiusToFahrenheit(celsius: number): number {
    return (celsius * 9) / 5 + 32;
  }

  private convertMillimetersToInches(mm: number): number {
    return mm / 25.4;
  }

  private handleApiError(error: unknown, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 503) {
        console.error(`Error 503 for ${context}, retrying...`);
      } else {
        console.error(`${context} API Error:`, {
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
        });
      }
    } else {
      console.error(`${context} error: ${error}`);
    }
  }

  private logLatestReadings(summary: WeatherSummary): void {
    console.log('\n=== Latest Weather Readings ===');

    if (summary.temperature.latest) {
      console.log('\nNYC Temperature:');
      console.log(`Time: ${summary.temperature.latest.timestamp} (UTC)`);
      console.log(
        `Temperature: ${summary.temperature.latest.temperature}°C ` +
          `(${summary.temperature.latest.temperatureF}°F)`
      );
      console.log(`Station: ${summary.temperature.latest.stationName}`);
    }

    if (summary.precipitation.latest) {
      console.log('\nSF Precipitation:');
      console.log(`Time: ${summary.precipitation.latest.timestamp} (UTC)`);
      console.log(
        `Precipitation: ${summary.precipitation.latest.precipitation}mm ` +
          `(${summary.precipitation.latest.precipitationInches}in)`
      );
      console.log(
        `Cumulative (${CONFIG.LOOKBACK_DAYS} days): ` +
          `${summary.precipitation.cumulative.millimeters}mm ` +
          `(${summary.precipitation.cumulative.inches}in)`
      );
      console.log(`Station: ${summary.precipitation.latest.stationName}`);
    }
  }
}
