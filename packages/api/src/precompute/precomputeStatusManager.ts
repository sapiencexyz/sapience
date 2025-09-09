import { getStringParam } from 'src/candle-cache/dbUtils';
import { PRECOMPUTE_IPC_KEYS } from './config';

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

export class PrecomputeStatusManager {
  private static instance: PrecomputeStatusManager;
  public static getInstance(): PrecomputeStatusManager {
    if (!this.instance) this.instance = new PrecomputeStatusManager();
    return this.instance;
  }

  public async getStatus(): Promise<ProcessStatus> {
    const statusString = await getStringParam(
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus
    );
    if (!statusString) return { isActive: false };
    try {
      const storedStatus = JSON.parse(statusString);
      return {
        isActive: storedStatus.isActive || false,
        processType: storedStatus.processType,
        resourceSlug: storedStatus.resourceSlug,
        startTime: storedStatus.startTime,
        builderStatus: storedStatus.builderStatus,
      };
    } catch {
      return { isActive: false };
    }
  }
}
