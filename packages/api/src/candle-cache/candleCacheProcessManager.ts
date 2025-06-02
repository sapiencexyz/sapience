import { CANDLE_CACHE_IPC_KEYS, REBUILD_PROCESS_TYPES } from './config';
import { getStringParam, setStringParam } from './dbUtils';
import { CandleCacheReBuilder } from './candleCacheReBuilder';
import { log } from 'src/utils/logs';
import { ProcessStatus } from './baseCandleCacheBuilder';

interface StoredProcessStatus {
  isActive: boolean;
  processType?: string;
  resourceSlug?: string;
  startTime?: number;
  builderStatus?: {
    status: string;
    description: string;
    timestamp: number;
  };
}

export class CandleCacheProcessManager {
  private static instance: CandleCacheProcessManager;
  private candleCacheReBuilder: CandleCacheReBuilder;
  private initialized = false;

  private constructor() {
    this.candleCacheReBuilder = CandleCacheReBuilder.getInstance();
  }

  public static getInstance(): CandleCacheProcessManager {
    if (!this.instance) {
      this.instance = new CandleCacheProcessManager();
    }
    return this.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      try {
        // Check if there's a stale process state and clean it up
        const statusString = await getStringParam(
          CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus
        );

        if (statusString) {
          try {
            const storedStatus: StoredProcessStatus = JSON.parse(statusString);

            // If a process was marked active for more than 1 hour, consider it stale
            if (
              storedStatus.isActive &&
              storedStatus.builderStatus &&
              storedStatus.builderStatus.timestamp &&
              Date.now() - storedStatus.builderStatus.timestamp > 3600000
            ) {
              log({
                message: 'Cleaning up stale process state',
                prefix: '[PROCESS_MANAGER]',
              });
              await this.clearProcessParams();
            }
          } catch (parseError) {
            log({
              message: `Failed to parse stored process status, clearing: ${parseError}`,
              prefix: '[PROCESS_MANAGER]',
            });
            await this.clearProcessParams();
          }
        }

        this.initialized = true;
      } catch (error) {
        log({
          message: `Failed to initialize process manager: ${error}`,
          prefix: '[PROCESS_MANAGER]',
        });
        throw error;
      }
    }
  }

  public async getStatus(): Promise<ProcessStatus> {
    await this.ensureInitialized();

    const statusString = await getStringParam(
      CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus
    );

    if (!statusString) {
      return { isActive: false };
    }

    try {
      const storedStatus: StoredProcessStatus = JSON.parse(statusString);

      // Get the most recent builder status from IPC (this is updated by BaseCandleCacheBuilder)
      const builderStatus = storedStatus.builderStatus
        ? {
            status: storedStatus.builderStatus.status,
            description: storedStatus.builderStatus.description,
            timestamp: storedStatus.builderStatus.timestamp,
          }
        : undefined;

      return {
        isActive: storedStatus.isActive || false,
        processType: storedStatus.processType,
        resourceSlug: storedStatus.resourceSlug,
        startTime: storedStatus.startTime,
        builderStatus,
      };
    } catch (parseError) {
      log({
        message: `Failed to parse process status: ${parseError}`,
        prefix: '[PROCESS_MANAGER]',
      });

      // Clear invalid status and return inactive
      await this.clearProcessParams();
      return { isActive: false };
    }
  }

  public async startRebuildAllCandles(): Promise<{
    success: boolean;
    message: string;
  }> {
    await this.ensureInitialized();

    const status = await this.getStatus();
    if (status.isActive) {
      return {
        success: false,
        message: 'A rebuild process is already active',
      };
    }

    try {
      await this.setProcessParams(REBUILD_PROCESS_TYPES.ALL_CANDLES);

      // Start the process in the background
      this.runRebuildProcess(async () => {
        await this.candleCacheReBuilder.rebuildAllCandles();
      });

      return {
        success: true,
        message: 'Candle cache rebuild process started',
      };
    } catch (error) {
      log({
        message: `Failed to start rebuild all candles: ${error}`,
        prefix: '[PROCESS_MANAGER]',
      });
      // Clean up in case of error
      await this.clearProcessParams().catch(() => {});
      return {
        success: false,
        message: `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  public async startRebuildResourceCandles(
    resourceSlug: string
  ): Promise<{ success: boolean; message: string }> {
    await this.ensureInitialized();

    const status = await this.getStatus();
    if (status.isActive) {
      return {
        success: false,
        message: 'A rebuild process is already active',
      };
    }

    try {
      await this.setProcessParams(
        REBUILD_PROCESS_TYPES.RESOURCE_CANDLES,
        resourceSlug
      );

      // Start the process in the background
      this.runRebuildProcess(async () => {
        await this.candleCacheReBuilder.rebuildCandlesForResource(resourceSlug);
      });

      return {
        success: true,
        message: `Candle cache rebuild process started for resource: ${resourceSlug}`,
      };
    } catch (error) {
      log({
        message: `Failed to start rebuild for resource ${resourceSlug}: ${error}`,
        prefix: '[PROCESS_MANAGER]',
      });
      // Clean up in case of error
      await this.clearProcessParams().catch(() => {});
      return {
        success: false,
        message: `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async setProcessParams(
    processType: string,
    resourceSlug?: string
  ): Promise<void> {
    const processStatus: StoredProcessStatus = {
      isActive: true,
      processType,
      resourceSlug,
      startTime: Date.now(),
      builderStatus: {
        status: 'idle',
        description: 'Starting process...',
        timestamp: Date.now(),
      },
    };

    await setStringParam(
      CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus,
      JSON.stringify(processStatus)
    );
  }

  private async clearProcessParams(): Promise<void> {
    const processStatus: StoredProcessStatus = {
      isActive: false,
      builderStatus: {
        status: 'idle',
        description: 'Process completed',
        timestamp: Date.now(),
      },
    };

    await setStringParam(
      CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus,
      JSON.stringify(processStatus)
    );
  }

  private runRebuildProcess(rebuildFn: () => Promise<void>): void {
    // Run the rebuild process asynchronously
    process.nextTick(async () => {
      try {
        log({
          message: 'Starting independent candle cache rebuild process',
          prefix: '[PROCESS_MANAGER]',
        });

        await rebuildFn();

        log({
          message: 'Candle cache rebuild process completed successfully',
          prefix: '[PROCESS_MANAGER]',
        });
      } catch (error) {
        log({
          message: `Candle cache rebuild process failed: ${error}`,
          prefix: '[PROCESS_MANAGER]',
        });
      } finally {
        // Clear process parameters when done
        try {
          await this.clearProcessParams();
        } catch (cleanupError) {
          log({
            message: `Failed to clean up process parameters: ${cleanupError}`,
            prefix: '[PROCESS_MANAGER]',
          });
        }
      }
    });
  }
}
