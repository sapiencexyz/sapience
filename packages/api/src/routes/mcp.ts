import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { registerAllMcpTools } from '../mcp/index.js'; // Import the new aggregator function
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import express from 'express';

// Create the McpServer instance
const server = new McpServer(
  {
    name: 'sapience-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      logging: {},
      tools: {
        listChanged: false,
      },
    },
  }
);

// Register all tools using the aggregator function
registerAllMcpTools(server);

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export const handleMcpAppRequests = (app: express.Application, url: string) => {
  // Handle POST requests for client-to-server communication
  app.post(url, async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`, {
      body: req.body,
    });

    // Capture response data for logging
    const originalJson = res.json;
    res.json = function (body) {
      console.log(`Response being sent:`, JSON.stringify(body, null, 2));
      return originalJson.call(this, body);
    };

    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        console.log(`Reusing session: ${sessionId}`);
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        console.log(`New session request: ${req.body.method}`);
        // New initialization request
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          // enableJsonResponse: true,
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            console.log(`Session initialized: ${sessionId}`);
            transports[sessionId] = transport;
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(
              `Transport closed for session ${sid}, removing from transports map`
            );
            delete transports[sid];
          }
        };

        // Connect to the MCP server BEFORE handling the request
        console.log(`Connecting transport to MCP server...`);
        await server.connect(transport);
        console.log(`Transport connected to MCP server successfully`);

        console.log(`Handling initialization request...`);
        await transport.handleRequest(req, res, req.body);
        console.log(`Initialization request handled, response sent`);
        return; // Already handled
      } else {
        console.error(
          'Invalid request: No valid session ID or initialization request'
        );
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      console.log(`Handling request for session: ${transport.sessionId}`);
      console.log(`Request body:`, JSON.stringify(req.body, null, 2));

      // Handle the request with existing transport
      console.log(`Calling transport.handleRequest...`);
      const startTime = Date.now();
      await transport.handleRequest(req, res, req.body);
      const duration = Date.now() - startTime;
      console.log(
        `Request handling completed in ${duration}ms for session: ${transport.sessionId}`
      );
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req: express.Request, res: express.Response) => {
    console.log(`GET Request received: ${req.method} ${req.url}`);

    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        console.log(`Invalid session ID in GET request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      // Check for Last-Event-ID header for resumability
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        console.log(`Establishing new SSE stream for session ${sessionId}`);
      }

      const transport = transports[sessionId];

      // Set up connection close monitoring
      res.on('close', () => {
        console.log(`SSE connection closed for session ${sessionId}`);
      });

      console.log(
        `Starting SSE transport.handleRequest for session ${sessionId}...`
      );
      const startTime = Date.now();
      await transport.handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(
        `SSE stream setup completed in ${duration}ms for session: ${sessionId}`
      );
    } catch (error) {
      console.error('Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req: express.Request, res: express.Response) => {
    console.log(`DELETE Request received: ${req.method} ${req.url}`);
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        console.log(`Invalid session ID in DELETE request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      console.log(
        `Received session termination request for session ${sessionId}`
      );
      const transport = transports[sessionId];

      // Capture response for logging
      const originalSend = res.send;
      res.send = function (body) {
        console.log(`DELETE response being sent:`, body);
        return originalSend.call(this, body);
      };

      console.log(`Processing session termination...`);
      const startTime = Date.now();
      await transport.handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(
        `Session termination completed in ${duration}ms for session: ${sessionId}`
      );

      // Check if transport was actually closed
      setTimeout(() => {
        if (transports[sessionId]) {
          console.log(
            `Note: Transport for session ${sessionId} still exists after DELETE request`
          );
        } else {
          console.log(
            `Transport for session ${sessionId} successfully removed after DELETE request`
          );
        }
      }, 100);
    } catch (error) {
      console.error('Error handling DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
};
