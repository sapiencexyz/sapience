export * from './agent';
export * from './market';
export * from './position';
export * from './message';

export interface AgentConfig {
  anthropicApiKey: string;
  interval: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
} 