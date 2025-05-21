import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import * as readFoilContractsTools from './readFoilContracts';
import * as writeFoilContractsTools from './writeFoilContracts';
import * as graphqlTools from './graphql';
import * as miscTools from './misc';

export function registerAllMcpTools(server: McpServer): void {
  // Register tools from readFoilContracts.ts
  for (const tool of Object.values(readFoilContractsTools)) {
    if (tool && typeof tool.name === 'string' && typeof tool.function === 'function') {
      server.tool(tool.name, { description: tool.description, parameters: tool.parameters }, tool.function as any);
    }
  }

  // Register tools from writeFoilContracts.ts
  for (const tool of Object.values(writeFoilContractsTools)) {
    if (tool && typeof tool.name === 'string' && typeof tool.function === 'function') {
      server.tool(tool.name, { description: tool.description, parameters: tool.parameters }, tool.function as any);
    }
  }

  // Register tools from graphql.ts
  for (const tool of Object.values(graphqlTools)) {
    if (tool && typeof tool.name === 'string' && typeof tool.function === 'function') {
      server.tool(tool.name, { description: tool.description, parameters: tool.parameters }, tool.function as any);
    }
  }

  // Register tools from misc.ts
  for (const tool of Object.values(miscTools)) {
    if (tool && typeof tool.name === 'string' && typeof tool.function === 'function') {
      server.tool(tool.name, { description: tool.description, parameters: tool.parameters }, tool.function as any);
    }
  }
}