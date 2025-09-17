declare module 'graphql-cost-analysis' {
  import { ValidationRule } from 'graphql';

  interface CostAnalysisOptions {
    maximumCost?: number;
    defaultCost?: number;
    variables?: Record<string, unknown>;
    createError?: (cost: number, maximumCost: number) => Error;
  }

  function costAnalysis(options?: CostAnalysisOptions): ValidationRule;

  export = costAnalysis;
}
