import { PRECOMPUTE_IPC_KEYS } from './config';
import { getStringParam, setStringParam } from 'src/candle-cache/dbUtils';
import { log } from 'src/utils/logs';
import { PnlAccuracyReconciler } from './reconciler';

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

export interface ProcessStatus {
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

export class PrecomputeProcessManager {
  private static instance: PrecomputeProcessManager;
  private initialized = false;

  public static getInstance(): PrecomputeProcessManager {
    if (!this.instance) this.instance = new PrecomputeProcessManager();
    return this.instance;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      const statusString = await getStringParam(
        PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus
      );
      if (statusString) {
        try {
          const storedStatus: StoredProcessStatus = JSON.parse(statusString);
          if (
            storedStatus.isActive &&
            storedStatus.builderStatus?.timestamp &&
            Date.now() - storedStatus.builderStatus.timestamp > 3600000
          ) {
            log({
              message: 'Cleaning up stale precompute state',
              prefix: '[PRECOMPUTE_PM]',
            });
            await this.clearProcessParams();
          }
        } catch (err) {
          log({
            message: `Failed to parse precompute state: ${err}`,
            prefix: '[PRECOMPUTE_PM]',
          });
          await this.clearProcessParams();
        }
      }
      this.initialized = true;
    } catch (error) {
      log({
        message: `Failed to initialize precompute manager: ${error}`,
        prefix: '[PRECOMPUTE_PM]',
      });
      throw error;
    }
  }

  public async getStatus(): Promise<ProcessStatus> {
    await this.ensureInitialized();
    const statusString = await getStringParam(
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus
    );
    if (!statusString) return { isActive: false };
    try {
      const storedStatus: StoredProcessStatus = JSON.parse(statusString);
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
    } catch (err) {
      log({
        message: `Failed to parse precompute status: ${err}`,
        prefix: '[PRECOMPUTE_PM]',
      });
      await this.clearProcessParams();
      return { isActive: false };
    }
  }

  public async startPrecomputeAll(): Promise<{
    success: boolean;
    message: string;
  }> {
    await this.ensureInitialized();
    const status = await this.getStatus();
    if (status.isActive)
      return {
        success: false,
        message: 'A precompute process is already active',
      };
    try {
      await this.setProcessParams('all');
      this.runProcess(async () => {
        const reconciler = PnlAccuracyReconciler.getInstance();
        await reconciler.runOnce();
      });
      return { success: true, message: 'Precompute process started' };
    } catch (error) {
      await this.clearProcessParams().catch(() => {});
      return {
        success: false,
        message: `Failed to start precompute: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async setProcessParams(processType: string): Promise<void> {
    const processStatus: StoredProcessStatus = {
      isActive: true,
      processType,
      startTime: Date.now(),
      builderStatus: {
        status: 'idle',
        description: 'Starting precompute...',
        timestamp: Date.now(),
      },
    };
    await setStringParam(
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus,
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
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus,
      JSON.stringify(processStatus)
    );
  }

  private runProcess(fn: () => Promise<void>): void {
    process.nextTick(async () => {
      try {
        log({
          message: 'Starting precompute process',
          prefix: '[PRECOMPUTE_PM]',
        });
        await fn();
        log({
          message: 'Precompute process completed successfully',
          prefix: '[PRECOMPUTE_PM]',
        });
      } catch (error) {
        log({
          message: `Precompute process failed: ${error}`,
          prefix: '[PRECOMPUTE_PM]',
        });
      } finally {
        try {
          await this.clearProcessParams();
        } catch (err) {
          log({
            message: `Failed to clean precompute params: ${err}`,
            prefix: '[PRECOMPUTE_PM]',
          });
        }
      }
    });
  }
}
