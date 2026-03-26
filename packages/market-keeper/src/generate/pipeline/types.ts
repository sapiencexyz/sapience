/**
 * Pipeline/Filter pattern types
 */

/**
 * Filter result with kept and removed items
 */
export interface FilterResult<T> {
  kept: T[];
  removed: T[];
}

/**
 * Base filter interface - all filters implement this
 */
export interface Filter<T> {
  /** Unique identifier for the filter */
  name: string;
  /** Human-readable description shown in logs */
  description: string;
  /** The actual filter logic */
  apply(items: T[]): FilterResult<T>;
}

/**
 * Stats tracked per filter execution
 */
export interface FilterStats {
  name: string;
  description: string;
  inputCount: number;
  keptCount: number;
  removedCount: number;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult<T> {
  output: T[];
  removed: T[];
  stats: FilterStats[];
}
