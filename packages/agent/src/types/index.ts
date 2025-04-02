export interface AgentConfig {
  interval: number;
  anthropicApiKey?: string;
  // Add other configuration options as needed
}

export interface Tool {
  name: string;
  description: string;
  parameters: any; // Define a more specific type if possible
  function: (...args: any[]) => Promise<any>; // Define more specific args/return if possible
} 