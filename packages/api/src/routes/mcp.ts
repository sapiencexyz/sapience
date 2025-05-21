import { Router, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomBytes } from 'crypto';
import { registerAllMcpTools } from '../mcp/index.js'; // Import the new aggregator function

const router = Router();

// Create the McpServer instance
const mcpServer = new McpServer({
  name: 'sapience-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {},
  },
});

// Register all tools using the aggregator function
registerAllMcpTools(mcpServer);

const activeTransports: Record<string, StreamableHTTPServerTransport> = {};

router.all('*', async (req: Request, res: Response) => {
  try {
    // The MCP spec for Streamable HTTP often involves a session ID in the path or query.
    // For this example, we'll derive a simplistic session ID from the request path.
    // A robust implementation would use a proper session ID from the request.
    const sessionId = req.path; // Or extract from req.query or a header

    let transport = activeTransports[sessionId];

    if (!transport) {
      const transportOptions: StreamableHTTPServerTransportOptions = {
        // sessionIdGenerator is required by the constructor options type
        sessionIdGenerator: () => randomBytes(16).toString('hex'),
        // other options can be set if needed
      };
      transport = new StreamableHTTPServerTransport(transportOptions);
      activeTransports[sessionId] = transport;

      // Connect the server to this new transport instance.
      // This establishes the link between the McpServer logic and this specific transport.
      await mcpServer.connect(transport);
      
      console.log(`New StreamableHTTPServerTransport created and connected for session: ${sessionId}`);

      res.on('close', () => {
        transport.close(); // Properly close the transport on client disconnect
        delete activeTransports[sessionId];
        console.log(`Transport closed and deleted for session: ${sessionId}`);
      });
    }

    // The transport's handle method expects the raw request and response objects.
    await transport.handleRequest(req, res);

  } catch (error) {
    console.error('[MCP] Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error in MCP handler');
    }
  }
});

export { router as mcpRoutes }; 