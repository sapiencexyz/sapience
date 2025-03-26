import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import * as tools from '../tools';
import { z } from 'zod';

interface ToolDefinition {
  parameters: {
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  function: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

// Create an MCP server
const server = new McpServer({
  name: "foil-mcp-server",
  version: "1.0.0"
});

// Debug log the available tools
console.error('Available tools:', Object.keys(tools));

// Register tools from each module
for (const [moduleName, moduleTools] of Object.entries(tools)) {
  console.error(`Processing module: ${moduleName}`);
  
  if (typeof moduleTools === 'object' && moduleTools !== null) {
    const toolsObj = moduleTools as unknown as Record<string, ToolDefinition>;
    console.error(`Tools in module ${moduleName}:`, Object.keys(toolsObj));

    for (const [toolName, tool] of Object.entries(toolsObj)) {
      try {
        // Format the tool name to be more descriptive
        const formattedToolName = `foil_${toolName}`
          .replace(/([A-Z])/g, '_$1') // Add underscore before capital letters
          .toLowerCase() // Convert to lowercase
          .replace(/^foil_get_/, 'get_foil_') // Move "foil" after "get"
          .replace(/^foil_list_/, 'list_foil_') // Move "foil" after "list"
          .replace(/epoch/g, 'period') // Replace "epoch" with "period"
          .replace(/[^a-z0-9_-]/g, '_') // Replace any invalid characters with underscore
          .replace(/_+/g, '_') // Replace multiple underscores with single underscore
          .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

        console.error(`Registering tool: ${formattedToolName}`);
        
        if (!tool.parameters || !tool.parameters.properties) {
          console.error(`Tool ${formattedToolName} is missing required parameters structure`);
          continue;
        }

        // Create a Zod schema from the tool's parameter definition
        const paramsSchema = z.object(
          Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, prop]) => [
              key,
              z.string()
            ])
          )
        ).required(
          Object.fromEntries(
            tool.parameters.required.map(key => [key, true])
          )
        );
        
        server.tool(
          formattedToolName,
          paramsSchema.shape,
          async (args) => {
            try {
              const result = await tool.function(args);
              return result;
            } catch (error) {
              console.error(`Error in tool ${formattedToolName}:`, error);
              return {
                content: [{ 
                  type: "text" as const,
                  text: error instanceof Error ? error.message : 'Unknown error occurred'
                }],
                isError: true
              };
            }
          }
        );
      } catch (error) {
        console.error(`Error registering tool ${moduleName}_${toolName}:`, error);
      }
    }
  }
}

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport); 