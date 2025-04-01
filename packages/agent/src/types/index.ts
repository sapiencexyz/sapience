export * from './agent';
export * from './message';

export interface AgentConfig {
  anthropicApiKey: string;
  interval: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
} 