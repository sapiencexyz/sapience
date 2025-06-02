import { CANDLE_CACHE_IPC_KEYS } from './config';
import { getStringParam } from './dbUtils';
import { log } from 'src/utils/logs';

export interface BuilderStatus {
  status: string;
  description: string;
  timestamp: number;
}

export interface ProcessStatus {
  isActive: boolean;
  processType?: string;
  resourceSlug?: string;
  startTime?: number;
  builderStatus?: BuilderStatus;
}

export interface AllBuildersStatus {
  candleCacheBuilder: ProcessStatus;
  candleCacheReBuilder: ProcessStatus;
}

export class CandleCacheStatusManager {
  private static instance: CandleCacheStatusManager;

  public static getInstance(): CandleCacheStatusManager {
    if (!this.instance) {
      this.instance = new CandleCacheStatusManager();
    }
    return this.instance;
  }

  private async getBuilderStatus(ipcKey: string): Promise<ProcessStatus> {
    try {
      const statusString = await getStringParam(ipcKey);
      
      if (!statusString) {
        return { isActive: false };
      }

      const storedStatus = JSON.parse(statusString);
      
      return {
        isActive: storedStatus.isActive || false,
        processType: storedStatus.processType,
        resourceSlug: storedStatus.resourceSlug,
        startTime: storedStatus.startTime,
        builderStatus: storedStatus.builderStatus,
      };
    } catch (parseError) {
      log({
        message: `Failed to parse builder status for ${ipcKey}: ${parseError}`,
        prefix: '[STATUS_MANAGER]',
      });
      return { isActive: false };
    }
  }

  public async getCandleCacheBuilderStatus(): Promise<ProcessStatus> {
    return this.getBuilderStatus(CANDLE_CACHE_IPC_KEYS.candleCacheBuilderStatus);
  }

  public async getCandleCacheReBuilderStatus(): Promise<ProcessStatus> {
    return this.getBuilderStatus(CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus);
  }

  public async getAllBuildersStatus(): Promise<AllBuildersStatus> {
    const [candleCacheBuilder, candleCacheReBuilder] = await Promise.all([
      this.getCandleCacheBuilderStatus(),
      this.getCandleCacheReBuilderStatus(),
    ]);

    return {
      candleCacheBuilder,
      candleCacheReBuilder,
    };
  }

  // For backward compatibility - returns CandleCacheReBuilder status (used by process manager)
  public async getStatus(): Promise<ProcessStatus> {
    return this.getCandleCacheReBuilderStatus();
  }
} 