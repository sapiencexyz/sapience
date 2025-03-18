import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import * as tools from '../tools';
import { z } from 'zod';

// Create an MCP server
const server = new McpServer({
  name: "foil-mcp-server",
  version: "1.0.0"
});

// Register tools from each module
for (const [moduleName, moduleTools] of Object.entries(tools)) {
  if (typeof moduleTools === 'object' && moduleTools !== null) {
    const toolsObj = moduleTools as Record<string, {
      parameters: any;
      function: (args: Record<string, unknown>) => Promise<unknown>;
    }>;

    for (const [toolName, tool] of Object.entries(toolsObj)) {
      const fullToolName = `${moduleName}_${toolName}`;
      
      // Create a simple Zod schema for the parameters
      const paramsSchema = z.object({
        contractAddress: z.string()
      });
      
      server.tool(
        fullToolName,
        paramsSchema.shape,
        async (args) => {
          try {
            const result = await tool.function(args);
            return {
              content: [{ 
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result)
              }]
            };
          } catch (error) {
            return {
              content: [{ 
                type: "text",
                text: error instanceof Error ? error.message : 'Unknown error occurred'
              }],
              isError: true
            };
          }
        }
      );
    }
  }
}

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport); 