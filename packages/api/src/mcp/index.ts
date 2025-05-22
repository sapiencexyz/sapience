import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import * as readFoilContractsTools from './readFoilContracts';
import * as writeFoilContractsTools from './writeFoilContracts';
import * as graphqlTools from './graphql';
import * as miscTools from './misc';

// Define the shared type for tool function responses
export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// The McpServer.tool method expects a function that includes an extra parameter,
// but our tool functions only take a single args parameter.
// This wrapper adapts our functions to the expected format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapToolFunction(toolFn: (args: any) => Promise<ToolResponse>) {
  // Return a function that matches the expected signature with both args and extra parameters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  return async (args: any, _extra: any) => {
    // Our tool functions don't use the extra parameter, so just pass the args
    const response = await toolFn(args);

    // Parse the text content to get structured data if it's JSON
    let structuredContent = {};
    try {
      const firstContent = response.content[0];
      if (firstContent?.type === 'text') {
        // Try to parse the JSON string
        const parsed = JSON.parse(firstContent.text);
        // If the parsed data is an object, use it as structuredContent
        if (typeof parsed === 'object' && parsed !== null) {
          structuredContent = parsed;
        }
      }
    } catch (e) {
      // If parsing fails or the result isn't an object, keep structuredContent as empty object
      console.warn('Failed to parse tool response as JSON or result is not an object:', e);
    }

    // Transform our ToolResponse to match the CallToolResult format
    return {
      // structuredContent,
      content: response.content,
      isError: response.isError
    };
  };
}

export function registerAllMcpTools(server: McpServer): void {
  // Register tools from readFoilContracts.ts
  for (const tool of Object.values(readFoilContractsTools)) {
    if (
      tool &&
      typeof tool.name === 'string' &&
      typeof tool.function === 'function'
    ) {
      // Wrap the tool function to match the expected signature
      const wrappedFn = wrapToolFunction(tool.function);

      server.tool(
        tool.name,
        { description: tool.description, parameters: tool.parameters },
        wrappedFn
      );
    }
  }

  // Register tools from writeFoilContracts.ts
  for (const tool of Object.values(writeFoilContractsTools)) {
    if (
      tool &&
      typeof tool.name === 'string' &&
      typeof tool.function === 'function'
    ) {
      const wrappedFn = wrapToolFunction(tool.function);
      server.tool(
        tool.name,
        { description: tool.description, parameters: tool.parameters },
        wrappedFn
      );
    }
  }

  // Register tools from graphql.ts
  for (const tool of Object.values(graphqlTools)) {
    if (
      tool &&
      typeof tool.name === 'string' &&
      typeof tool.function === 'function'
    ) {
      const wrappedFn = wrapToolFunction(tool.function);
      server.tool(
        tool.name,
        { description: tool.description, parameters: tool.parameters },
        wrappedFn
      );
    }
  }

  // Register tools from misc.ts
  for (const tool of Object.values(miscTools)) {
    if (
      tool &&
      typeof tool.name === 'string' &&
      typeof tool.function === 'function'
    ) {
      const wrappedFn = wrapToolFunction(tool.function);

      server.tool(
        tool.name,
        { description: tool.description, parameters: tool.parameters },
        wrappedFn
      );
    }
  }
}
