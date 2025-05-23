import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import * as readFoilContractsTools from './readFoilContracts';
import * as writeFoilContractsTools from './writeFoilContracts';
import * as graphqlTools from './graphql';
import * as miscTools from './misc';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// The McpServer.tool method expects a function that includes an extra parameter,
// but our tool functions only take a single args parameter.
// This wrapper adapts our functions to the expected format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapToolFunction(toolFn: (args: any) => Promise<CallToolResult>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  return (args: any, _extra: any) => toolFn(args);
}

// Helper function to register a set of tools
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerTools(server: McpServer, tools: Record<string, any>): void {
  for (const tool of Object.values(tools)) {
    if (
      tool &&
      typeof tool.name === 'string' &&
      typeof tool.function === 'function'
    ) {
      server.tool(
        tool.name,
        tool.description,
        tool.parameters.properties,
        wrapToolFunction(tool.function)
      );
    }
  }
}

export function registerAllMcpTools(server: McpServer): void {
  // Register all tools using the helper function
  registerTools(server, readFoilContractsTools);
  registerTools(server, writeFoilContractsTools);
  registerTools(server, graphqlTools);
  registerTools(server, miscTools);
}
