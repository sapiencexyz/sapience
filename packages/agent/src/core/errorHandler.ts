import { Logger } from '../utils/logger';
import { AgentState } from '../types';

export class ErrorHandler {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second

  public static async handleError(error: Error, state: AgentState, context: string): Promise<AgentState> {
    Logger.error(`Error in ${context}: ${error.message}`);
    if (error.stack) {
      Logger.error(`Stack trace: ${error.stack}`);
    }

    // Log the state at the time of error
    Logger.error(`State at error: ${JSON.stringify(state, null, 2)}`);

    // Determine recovery strategy based on error type
    if (error.name === 'NetworkError') {
      return this.handleNetworkError(state);
    } else if (error.name === 'ToolError') {
      return this.handleToolError(state);
    } else {
      return this.handleGenericError(state);
    }
  }

  private static async handleNetworkError(state: AgentState): Promise<AgentState> {
    Logger.info('Attempting to recover from network error...');
    // Add network retry logic here
    return state;
  }

  private static async handleToolError(state: AgentState): Promise<AgentState> {
    Logger.info('Attempting to recover from tool error...');
    // Add tool-specific recovery logic here
    return state;
  }

  private static async handleGenericError(state: AgentState): Promise<AgentState> {
    Logger.info('Attempting to recover from generic error...');
    // Add generic recovery logic here
    return state;
  }

  public static async retry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        Logger.warn(`Attempt ${attempt} failed in ${context}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
        }
      }
    }
    
    throw lastError || new Error(`All ${maxRetries} attempts failed in ${context}`);
  }
} 