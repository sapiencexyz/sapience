import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // For return type

// Define the input schema for the example tool using Zod
export const GetGreetingInputSchema = z.object({
  name: z.string().optional().describe('The name of the person to greet.'),
});

// Define the output schema for the example tool (conceptual)
export const GetGreetingOutputSchema = z.object({
  greeting: z.string(),
});

// Type for the 'extra' parameter in the tool handler, if known more specifically.
// For now, using 'any'. If it corresponds to RequestHandlerExtra, we can use that.
// import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/server/types.js'; // If available and applicable
type GreetingToolExtra = any; // Replace with specific type if available

export function registerGreetingTool(server: McpServer): void {
  server.tool(
    'get_greeting',
    {
      title: 'Returns a personalized greeting.',
      schema: GetGreetingInputSchema,
    },
    async (args: z.infer<typeof GetGreetingInputSchema>, extra: GreetingToolExtra): Promise<CallToolResult> => {
      try {
        const name = args.name || 'World';
        const greeting = `Hello, ${name}! Welcome to the MCP tool integration.`;
        return {
          content: [{ type: 'text', text: greeting }],
        };
      } catch (error) {
        console.error('Error in get_greeting tool:', error);
        // Return a valid CallToolResult for errors as well
        return {
          content: [{ type: 'text', text: 'An unexpected error occurred in the get_greeting tool.' }],
        };
      }
    }
  );
} 