import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGreetingTool } from './greetingTool.js';

// Import other tool registration functions here as they are created
// e.g., import { registerAnotherTool } from './anotherTool.js';

export function registerAllMcpTools(server: McpServer): void {
  registerGreetingTool(server);
  // Call other tool registration functions here
  // e.g., registerAnotherTool(server);
  
  console.log('[MCP Server] All tools registered.'); // Optional: confirmation log
} 