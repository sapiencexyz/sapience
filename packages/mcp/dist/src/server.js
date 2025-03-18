import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as tools from '../tools';
// Create an MCP server
const server = new McpServer({
    name: "foil-mcp-server",
    version: "1.0.0"
});
// Register tools from each module
console.error('[Server] Starting tool registration...');
for (const [moduleName, moduleTools] of Object.entries(tools)) {
    console.error(`[Server] Processing module: ${moduleName}`);
    if (typeof moduleTools === 'object' && moduleTools !== null) {
        const toolsObj = moduleTools;
        for (const [toolName, tool] of Object.entries(toolsObj)) {
            const fullToolName = `${moduleName}.${toolName}`;
            console.error(`[Server] Registering tool: ${fullToolName}`);
            server.tool(fullToolName, tool.parameters, async (args, extra) => {
                console.error(`[Server] Executing tool: ${fullToolName} with args:`, args);
                try {
                    const result = await tool.function(args);
                    console.error(`[Server] Tool ${fullToolName} succeeded:`, result);
                    // Handle different response types
                    if (result && typeof result === 'object' && 'content' in result) {
                        return result;
                    }
                    return {
                        content: [{
                                type: "text",
                                text: typeof result === 'string' ? result : JSON.stringify(result)
                            }]
                    };
                }
                catch (error) {
                    console.error(`[Server] Tool ${fullToolName} failed:`, error);
                    return {
                        content: [{
                                type: "text",
                                text: error instanceof Error ? error.message : 'Unknown error occurred'
                            }],
                        isError: true
                    };
                }
            });
        }
    }
}
console.error('[Server] Tool registration complete');
// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
